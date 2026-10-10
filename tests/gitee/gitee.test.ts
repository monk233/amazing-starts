import { describe, expect, it } from 'vitest';
import type { LocalDatabase } from '../../src/data/database';
import { GITEE_PREFIX } from '../../src/git/types';
import { GITEE_ACCOUNT, GITEE_TOKEN, giteeRepo, rig } from '../github/helpers';

async function check<T>(r: ReturnType<typeof rig>, fn: (db: LocalDatabase) => Promise<T>): Promise<T> {
  const db = await r.database(); try { return await fn(db); } finally { db.close(); }
}

describe('Gitee 令牌与同步', () => {
  it('连接时校验身份与收藏读取能力，凭证按账号隔离保存', async () => {
    const r = rig(); const state = await r.connectGitee();
    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0]?.account.accountId).toBe(GITEE_ACCOUNT);
    expect(state.accounts[0]?.provider).toBe('gitee');
    expect(state.accounts[0]?.syncMode).toBe('stars');
    expect(state.accounts[0]?.connected).toBe(true);
    expect(JSON.stringify(state)).not.toContain(GITEE_TOKEN);
    expect(r.local.items).toEqual({});
    expect(r.session.items['credential:' + GITEE_ACCOUNT + ':gitee']).toContain(GITEE_TOKEN);
    expect(r.fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://gitee.com/api/v5/user',
      'https://gitee.com/api/v5/user/starred?page=1&per_page=1',
    ]);
    expect(r.fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer ' + GITEE_TOKEN });
  });
  it('分页读取全部 Stars 后一次性提交，列表与归属保持为空', async () => {
    const r = rig(); await r.connectGitee();
    await r.startGitee();
    r.add(Array.from({ length: 100 }, (_, index) => giteeRepo(index + 1)));
    await r.step(r.service, GITEE_ACCOUNT);
    r.add([giteeRepo(101)]);
    let state = await r.step(r.service, GITEE_ACCOUNT);
    expect(state.accounts[0]?.sync?.phase).toBe('commit');
    state = await r.step(r.service, GITEE_ACCOUNT);
    expect(state.accounts[0]?.sync?.state).toBe('succeeded');
    const repositories = await check(r, db => db.list('repositories', GITEE_ACCOUNT));
    expect(repositories).toHaveLength(101);
    expect(repositories[0]).toMatchObject({ id: GITEE_PREFIX + '1', fullName: 'owner/repo-1', language: 'Go', visibility: 'public', starredAt: '', topics: [] });
    expect(await check(r, db => db.list('lists', GITEE_ACCOUNT))).toEqual([]);
    expect(await check(r, db => db.list('memberships', GITEE_ACCOUNT))).toEqual([]);
    const pages = r.fetcher.mock.calls.map(([url]) => String(url)).filter(url => url.includes('/user/starred?page=') && url.includes('per_page=100'));
    expect(pages).toEqual(['https://gitee.com/api/v5/user/starred?page=1&per_page=100', 'https://gitee.com/api/v5/user/starred?page=2&per_page=100']);
  });
  it('拒绝同一页中的重复记录并保留原快照', async () => {
    const r = rig(); await r.connectGitee(); await r.startGitee();
    r.add([giteeRepo(1), giteeRepo(1)]);
    const state = await r.step(r.service, GITEE_ACCOUNT);
    expect(state.accounts[0]?.sync?.state).toBe('failed');
    expect(state.accounts[0]?.sync?.error).toContain('重复');
    expect(await check(r, db => db.list('repositories', GITEE_ACCOUNT))).toEqual([]);
  });
  it('令牌失效时停止同步并清理凭证，账号本身保留', async () => {
    const r = rig(); await r.connectGitee(); await r.startGitee();
    r.add({ message: 'Bad credentials' }, 401);
    const state = await r.step(r.service, GITEE_ACCOUNT);
    expect(state.accounts[0]?.sync?.state).toBe('failed');
    expect(state.accounts[0]?.connected).toBe(false);
    expect(state.accounts).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain(GITEE_TOKEN);
  });
  it('识别限流与网络错误，不把它们当成空收藏', async () => {
    const r = rig(); await r.connectGitee(); await r.startGitee();
    r.add({ message: 'rate limit exceeded' }, 403);
    const state = await r.step(r.service, GITEE_ACCOUNT);
    expect(state.accounts[0]?.sync?.state).toBe('failed');
    expect(state.accounts[0]?.sync?.error).toContain('限流');
    await expect(r.service.handle({ type: 'GIT_SYNC', accountId: GITEE_ACCOUNT })).rejects.toThrow('限流');
  });
  it('拒绝不支持的同步规则，不建立 Lists 阶段', async () => {
    const r = rig(); await r.connectGitee();
    await expect(r.service.handle({ type: 'GIT_RULE_SAVE', accountId: GITEE_ACCOUNT, mode: 'stars+lists' })).rejects.toThrow('Gitee');
    expect((await r.service.handle({ type: 'GIT_READ' })).accounts[0]?.syncMode).toBe('stars');
  });
  it('同一个工作区里 GitHub 与 Gitee 账号各自独立，账号切换后互不影响', async () => {
    const r = rig(); await r.connect(); await r.connectGitee();
    const state = await r.service.handle({ type: 'GIT_READ' });
    expect(state.accounts.map(item => item.provider)).toEqual(['github', 'gitee']);
    expect(state.accounts.map(item => item.account.accountId)).toEqual(['U_a', GITEE_ACCOUNT]);
    expect(r.session.items['credential:U_a:github']).toBeDefined();
    expect(r.session.items['credential:' + GITEE_ACCOUNT + ':gitee']).toContain(GITEE_TOKEN);
    const removed = await r.service.handle({ type: 'GIT_DISCONNECT', accountId: GITEE_ACCOUNT });
    expect(removed.accounts.map(item => item.connected)).toEqual([true, false]);
    expect(r.session.items['credential:U_a:github']).toBeDefined();
    expect(r.session.items['credential:' + GITEE_ACCOUNT + ':gitee']).toBeUndefined();
  });
  it('把令牌错误分类为受限访问，不写入任何凭证', async () => {
    const r = rig(); r.add({ message: 'invalid token' }, 401); r.add({ message: 'invalid token' }, 401);
    await expect(r.service.handle({ type: 'GIT_CONNECT', provider: 'gitee', token: GITEE_TOKEN, remember: true })).rejects.toMatchObject({ code: 'unauthorized' });
    expect(r.local.items).toEqual({});
    expect(r.session.items).toEqual({});
    expect((await r.service.handle({ type: 'GIT_READ' })).accounts).toEqual([]);
  });
  it('拒绝缺少账号标识的响应', async () => {
    const r = rig(); r.add({ login: 'no-id' }); r.add([]);
    await expect(r.service.handle({ type: 'GIT_CONNECT', provider: 'gitee', token: GITEE_TOKEN, remember: false })).rejects.toThrow('Gitee 账号 ID');
    expect(r.session.items).toEqual({});
  });
});
