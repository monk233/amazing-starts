import type { Account } from '../data/types';
import { GitError, record, text } from '../git/types';

export class GitHubClient {
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now = Date.now) {}

  private async send(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    // Native browser fetch must not receive this client instance as its receiver.
    const fetcher = this.fetcher;
    let response: Response;
    try { response = await fetcher(url, { ...init, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15_000) }); }
    catch { throw new GitError('无法连接 GitHub，或请求超时。请检查网络后重试。', 'network'); }
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new GitError('GitHub 返回了无法识别的响应，原快照未更新。'); }
    const data = record(body);
    if (!response.ok) {
      const message = typeof data.message === 'string' ? data.message : '';
      if (response.status === 429 || response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after') || /rate limit/i.test(message))) {
        const retry = Number(response.headers.get('retry-after'));
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        const retryAt = Math.max(this.now() + (retry > 0 ? retry : 60) * 1000, Number.isFinite(reset) ? reset : 0);
        throw new GitError('GitHub 请求限流，请稍后重新同步。原快照未更新。', 'rate_limit', retryAt);
      }
      if (response.status === 401) throw new GitError('GitHub Access Token 已失效，请填写新的 Token 并重新验证。', 'unauthorized');
      if (response.status === 403 && (response.headers.has('x-github-sso') || /organization|saml|sso/i.test(message))) throw new GitError('组织的 Token／SSO 策略限制了访问，请在 GitHub 检查组织授权。', 'organization');
      if (response.status === 403) throw new GitError('GitHub 拒绝访问，请检查授权范围及组织策略。', 'forbidden');
      if (response.status === 404) throw new GitError('GitHub 资源不存在或当前账号无权访问。原快照未更新。', 'not_found');
      throw new GitError(`GitHub 请求失败（HTTP ${response.status}），请稍后重试。`);
    }
    return data;
  }

  async identity(token: string): Promise<Account> {
    const data = await this.send('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' } });
    const id = text(data.node_id);
    if (!/^[A-Za-z0-9_=:-]{1,180}$/.test(id)) throw new GitError('GitHub 账号 ID 无效。');
    return { accountId: id, id, login: text(data.login), avatarUrl: text(data.avatar_url) };
  }

  async verifyToken(token: string): Promise<Account> {
    const [account, data] = await Promise.all([
      this.identity(token),
      this.graphql(token, `query VerifyAccess { viewer { id
        starredRepositories(first: 1) { totalCount }
        lists(first: 1) { totalCount nodes { id items(first: 1) { totalCount } } }
      } }`, {}),
    ]);
    const viewer = record(data.viewer);
    if (viewer.id !== account.accountId) throw new GitError('GitHub 账号识别结果不一致，Token 未保存。', 'account');
    const stars = record(viewer.starredRepositories); const lists = record(viewer.lists);
    const counts = [stars.totalCount, lists.totalCount];
    if (!Array.isArray(lists.nodes) || lists.nodes.length > 1 || lists.nodes.length !== Math.min(Number(lists.totalCount), 1)) throw new GitError('GitHub Lists 验证响应不完整，Token 未保存。');
    for (const list of lists.nodes) { text(record(list).id); counts.push(record(record(list).items).totalCount); }
    if (counts.some(count => !Number.isSafeInteger(count) || Number(count) < 0)) throw new GitError('GitHub 读取能力验证失败，Token 未保存。');
    return account;
  }

  async graphql(token: string, query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
    const body = await this.send('https://api.github.com/graphql', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    // Never accept partial GraphQL data: missing nodes could otherwise delete valid local records.
    if (body.errors !== undefined && (!Array.isArray(body.errors) || body.errors.length)) {
      const errors = Array.isArray(body.errors) ? body.errors.filter(record => record && typeof record === 'object') : [];
      if (errors.some(error => error.type === 'RATE_LIMITED')) throw new GitError('GitHub GraphQL 请求限流，请稍后重新同步。', 'rate_limit', this.now() + 60_000);
      if (errors.some(error => /scope/i.test(String(error.message)))) throw new GitError('Access Token 权限不足，无法读取所需 GitHub 数据。请检查权限或更换 Token。', 'scope');
      throw new GitError('GitHub GraphQL 返回不完整数据或访问错误，原快照未更新。请检查权限后重试。', 'graphql');
    }
    return record(body.data);
  }
}
