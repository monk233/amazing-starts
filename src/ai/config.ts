export interface AiConfig { baseUrl: string; model: string; remember: boolean }
export interface AiInput extends AiConfig { apiKey: string }
export interface AiState { config: AiConfig | null; hasApiKey: boolean }
export class AiError extends Error {}

export function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new AiError('请输入有效的 Base URL。'); }
  if (url.username || url.password || url.search || url.hash) throw new AiError('Base URL 不能包含账号、密码、查询参数或片段。');
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new AiError('服务地址必须使用 HTTPS；仅 localhost 和 127.0.0.1 允许 HTTP。');
  }
  return url.href.replace(/\/+$/, '');
}

// Chrome 的主机权限不按端口隔离；凭证另行绑定完整的规范化 Base URL。
export function permissionOrigin(baseUrl: string): string {
  const url = new URL(normalizeBaseUrl(baseUrl));
  return `${url.protocol}//${url.hostname}/*`;
}

export function isAiInput(value: unknown): value is AiInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 4 && typeof item.baseUrl === 'string' && item.baseUrl.length <= 2048 &&
    typeof item.model === 'string' && item.model.length <= 256 && typeof item.remember === 'boolean' &&
    typeof item.apiKey === 'string' && item.apiKey.length <= 16_384 && !/[\r\n]/.test(item.apiKey);
}
