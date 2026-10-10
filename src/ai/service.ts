import { CredentialVault } from '../data/credentials';
import type { StorageArea } from '../data/storage';
import { AiError, isAiInput, normalizeBaseUrl, permissionOrigin, type AiConfig, type AiInput, type AiState } from './config';

const CONFIG_KEY = 'ai:config:v1';
const MAX_RESPONSE_BYTES = 1_048_576;
export class AiService {
  private tail: Promise<unknown> = Promise.resolve();
  private vault: CredentialVault;
  constructor(private local: StorageArea, session: StorageArea,
    private hasPermission: (origin: string) => Promise<boolean>, private fetcher: typeof fetch = fetch) {
    this.vault = new CredentialVault(local, session);
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.tail.then(operation);
    this.tail = task.catch(() => undefined);
    return task;
  }
  private async credentialId(baseUrl: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(baseUrl));
    return `ai:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  private async readConfig(): Promise<AiConfig | null> {
    const raw = (await this.local.get(CONFIG_KEY))[CONFIG_KEY];
    if (raw === undefined) return null;
    if (!raw || typeof raw !== 'object') throw new AiError('AI 配置损坏，未覆盖原数据。');
    const value = raw as Record<string, unknown>;
    if (value.version !== 1 || !isAiInput({ baseUrl: value.baseUrl, model: value.model, remember: value.remember, apiKey: '' })) {
      throw new AiError('AI 配置版本或内容无效，未覆盖原数据。');
    }
    const baseUrl = normalizeBaseUrl(value.baseUrl as string);
    return { baseUrl, model: value.model as string, remember: value.remember as boolean };
  }
  private async snapshot(): Promise<AiState> {
    const config = await this.readConfig();
    return { config, hasApiKey: config ? !!await this.vault.read(await this.credentialId(config.baseUrl), 'ai') : false };
  }
  read(): Promise<AiState> { return this.serialize(() => this.snapshot()); }
  save(input: AiInput): Promise<AiState> {
    return this.serialize(async () => {
      if (!isAiInput(input)) throw new AiError('AI 配置格式无效。');
      const baseUrl = normalizeBaseUrl(input.baseUrl);
      const previous = await this.readConfig();
      const id = await this.credentialId(baseUrl);
      // 即使旧地址曾经使用过，更换地址时也必须重新明确输入 Key。
      const secret = input.apiKey.trim() || (previous?.baseUrl === baseUrl ? await this.vault.read(id, 'ai') : null);
      if (!secret) throw new AiError('请输入 API Key；更换 Base URL 或浏览器会话结束后需要重新输入。');
      await this.vault.save(id, 'ai', secret, input.remember);
      const config: AiConfig = { baseUrl, model: input.model.trim(), remember: input.remember };
      await this.local.set({ [CONFIG_KEY]: { version: 1, ...config } });
      if (previous && previous.baseUrl !== baseUrl) await this.vault.forget(await this.credentialId(previous.baseUrl), 'ai');
      return this.snapshot();
    });
  }
  models(expectedBaseUrl: string): Promise<string[]> {
    return this.serialize(async () => {
      const config = await this.readConfig();
      if (!config) throw new AiError('请先保存 AI 服务配置。');
      if (normalizeBaseUrl(expectedBaseUrl) !== config.baseUrl) throw new AiError('服务地址已被其他页面修改，请重新加载配置后重试。');
      if (!await this.hasPermission(permissionOrigin(config.baseUrl))) throw new AiError('尚未授权访问该服务，请再次点击并允许主机权限。');
      const secret = await this.vault.read(await this.credentialId(config.baseUrl), 'ai');
      if (!secret) throw new AiError('当前会话没有 API Key，请重新输入并保存。');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await this.fetcher(`${config.baseUrl}/models`, {
          method: 'GET', headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
          credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
        });
        if (!response.ok) {
          if (response.body) await response.body.cancel();
          const detail = response.status === 401 || response.status === 403 ? '请检查 API Key 和访问权限。' :
            response.status === 404 ? '该地址可能不支持 /models；仍可手动填写模型。' :
            response.status === 429 ? '服务限流，请稍后重试。' : '请检查服务状态。';
          throw new AiError(`模型目录请求失败（HTTP ${response.status}）。${detail}`);
        }
        if (!response.body) throw new AiError('服务返回空响应，无法读取模型目录。');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let size = 0, text = '';
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new AiError('模型目录响应过大，已停止读取。'); }
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
        } finally { reader.releaseLock(); }
        let data: unknown;
        try { data = JSON.parse(text); } catch { throw new AiError('服务未返回有效的 JSON 模型目录。'); }
        if (!data || typeof data !== 'object' || !('data' in data) || !Array.isArray(data.data) || data.data.length > 5000) {
          throw new AiError('模型目录格式不兼容，需要 data 数组；可以手动填写模型。');
        }
        const ids: string[] = [];
        for (const model of data.data) {
          if (!model || typeof model.id !== 'string' || !model.id.trim() || model.id.length > 256 || /[\x00-\x1f\x7f]/.test(model.id)) {
            throw new AiError('模型目录包含无效的模型 ID。');
          }
          // 不接受服务把凭证回显到可见的模型名称中。
          if (model.id.includes(secret)) throw new AiError('服务返回的模型目录包含敏感内容，已拒绝展示。');
          ids.push(model.id);
        }
        return [...new Set(ids)].sort();
      } catch (error) {
        if (error instanceof AiError) throw error;
        throw new AiError(controller.signal.aborted ? '请求超时（15 秒），请检查服务后重试。' : '网络请求失败，请检查服务地址、权限和网络；不允许重定向。');
      } finally { clearTimeout(timer); }
    });
  }
}
