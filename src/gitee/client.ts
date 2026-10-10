import type { Account } from '../data/types';
import { GITEE_PREFIX, GitError, isRecord, record } from '../git/types';

const API = 'https://gitee.com/api/v5';

export interface GiteeProfile { account: Account; starred: number | null }

export class GiteeClient {
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now = Date.now) {}

  private async send(path: string, token: string, query: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(API + path);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    // Gitee v5 接受 Bearer 认证；令牌不进入 URL，避免出现在日志与错误信息里。
    const request: RequestInit = { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15_000) };
    const fetcher = this.fetcher;
    let response: Response;
    try { response = await fetcher(url.href, request); }
    catch { throw new GitError('无法连接 Gitee，或请求超时。请检查网络后重试。', 'network'); }
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new GitError('Gitee 返回了无法识别的响应，原快照未更新。'); }
    if (!response.ok) {
      const message = isRecord(body) && typeof body.message === 'string' ? body.message : '';
      if (response.status === 429 || response.status === 403 && /rate limit|限流/i.test(message)) throw new GitError('Gitee 请求限流，请稍后重新同步。原快照未更新。', 'rate_limit', this.now() + 60_000);
      if (response.status === 401) throw new GitError('Gitee 私人令牌无效或已过期，请重新生成并验证。', 'unauthorized');
      if (response.status === 403) throw new GitError('Gitee 拒绝访问，请检查令牌权限。', 'forbidden');
      if (response.status === 404) throw new GitError('Gitee 资源不存在或当前令牌无权访问。原快照未更新。', 'not_found');
      throw new GitError(`Gitee 请求失败（HTTP ${response.status}），请稍后重试。`);
    }
    return body;
  }

  async profile(token: string): Promise<GiteeProfile> {
    const data = record(await this.send('/user', token));
    const id = String(data.id ?? '');
    if (!/^[0-9]{1,32}$/.test(id)) throw new GitError('Gitee 账号 ID 无效。');
    const login = typeof data.login === 'string' && data.login ? data.login : typeof data.name === 'string' && data.name ? data.name : '';
    if (!login) throw new GitError('Gitee 账号信息不完整，令牌未保存。');
    const starred = Number(data.stared);
    return {
      account: { accountId: GITEE_PREFIX + id, id: GITEE_PREFIX + id, login, avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : '', provider: 'gitee' },
      starred: Number.isSafeInteger(starred) && starred >= 0 ? starred : null,
    };
  }

  /** 读取一页 star 的仓库；Gitee 的 per_page 上限是 100。 */
  async starred(token: string, page: number, perPage: number): Promise<Record<string, unknown>[]> {
    const body = await this.send('/user/starred', token, { page: String(page), per_page: String(perPage) });
    if (!Array.isArray(body)) throw new GitError('Gitee 返回的收藏列表不完整，原快照未更新。');
    return body.map(record);
  }

  async verifyToken(token: string): Promise<GiteeProfile> {
    const [profile, probe] = await Promise.all([this.profile(token), this.starred(token, 1, 1)]);
    if (probe.length > 1) throw new GitError('Gitee 读取能力验证失败，令牌未保存。');
    return profile;
  }
}
