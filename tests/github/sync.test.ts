import { describe, expect, it } from 'vitest';
import type { LocalDatabase } from '../../src/data/database';
import type { Repository } from '../../src/data/types';
import { newSync } from '../../src/github/sync';
import { items, list, lists, rig, star, stars } from './helpers';

const oldRepo: Repository = { accountId: 'U_a', id: 'R_1', fullName: 'old/name', description: null, language: null, topics: [], visibility: 'public', starredAt: '2026-01-01T00:00:00Z', pushedAt: null, archived: false, fetchedAt: '2026-01-01T00:00:00Z' };
async function seeded() {
  const r = rig(); await r.connect(); const db = await r.database();
  await db.put('repositories', 'U_a', oldRepo);
  await db.put('repositories', 'U_b', { ...oldRepo, accountId: 'U_b' });
  await db.put('repositoryTags', 'U_a', { accountId: 'U_a', id: 'link', repositoryId: 'R_1', tagId: 'tag', source: 'manual' });
  await db.put('handbooks', 'U_a', { accountId: 'U_a', id: 'book', title: 'Notes', repositoryIds: ['R_1'], template: '', markdown: 'keep my notes', source: 'manual', revision: 1, updatedAt: '' });
  db.close(); return r;
}
async function check<T>(r: ReturnType<typeof rig>, fn: (db: LocalDatabase) => Promise<T>): Promise<T> {
  const db = await r.database(); try { return await fn(db); } finally { db.close(); }
}

describe('Complete, resumable GitHub snapshots', () => {
  it('reads more than 100 Stars, Lists and List items across worker restarts before replacing the snapshot', async () => {
    const r = await seeded(); await r.start();
    const first = Array.from({ length: 100 }, (_, i) => i);
    r.add(stars(first.map(star), 101, true, 'stars-next')); await r.step();
    expect((await check(r, db => db.list('repositories', 'U_a')))[0]?.fullName).toBe('old/name');
    r.add(stars([star(100)], 101)); await r.step(r.restart());
    r.add(lists(first.map(list), 101, true, 'lists-next')); await r.step(r.restart());
    r.add(lists([list(100)], 101)); await r.step();
    r.add(items('L_0', first, 101, true, 'items-next')); await r.step();
    r.add(items('L_0', [100], 101)); await r.step(r.restart());
    for (let i = 1; i <= 100; i++) { r.add(items('L_' + i, [])); await r.step(); }
    expect(await check(r, db => db.list('lists', 'U_a'))).toHaveLength(0);
    const state = await r.step(r.restart());
    expect(state.accounts[0]?.sync?.state).toBe('succeeded');
    expect(state.accounts[0]?.account.lastSyncedAt).toBeTruthy();
    expect(await check(r, db => db.list('repositories', 'U_a'))).toHaveLength(101);
    expect(await check(r, db => db.list('lists', 'U_a'))).toHaveLength(101);
    expect(await check(r, db => db.list('memberships', 'U_a'))).toHaveLength(101);
    expect((await check(r, db => db.list('repositories', 'U_a'))).find(repo => repo.id === 'R_1')?.fullName).toBe('owner/repo-1');
    expect(await check(r, db => db.list('repositories', 'U_b'))).toEqual([{ ...oldRepo, accountId: 'U_b' }]);
    expect(await check(r, db => db.list('repositoryTags', 'U_a'))).toHaveLength(1);
    expect(await check(r, db => db.list('handbooks', 'U_a'))).toHaveLength(1);
    const cursors = r.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/graphql')).map(([, init]) => JSON.parse(String(init?.body)).variables.cursor);
    expect(cursors).toContain('stars-next'); expect(cursors).toContain('lists-next'); expect(cursors).toContain('items-next');
  });
  it.each([401, 403, 404, 429, 500])('preserves previous data and sync timestamps when a later page returns HTTP %s', async status => {
    const r = await seeded(); await r.start(); r.add(stars([star(2)], 2, true, 'next')); await r.step();
    r.add({ message: 'denied' }, status); const state = await r.step();
    expect(state.accounts[0]?.sync?.state).toBe('failed');
    expect(state.accounts[0]?.account.lastSyncedAt).toBeUndefined();
    expect(await check(r, db => db.list('repositories', 'U_a'))).toEqual([oldRepo]);
    if (status === 401) expect(state.accounts[0]?.connected).toBe(false);
    if (status === 429) await expect(r.service.handle({ type: 'GIT_SYNC', accountId: 'U_a' })).rejects.toThrow('限流');
  });
  it('does not commit partial GraphQL results', async () => {
    const r = await seeded(); await r.start(); r.add(stars([])); await r.step();
    r.add({ ...lists([]), errors: [{ message: 'inaccessible list' }] }); const state = await r.step();
    expect(state.accounts[0]?.sync?.state).toBe('failed'); expect(await check(r, db => db.list('repositories', 'U_a'))).toEqual([oldRepo]);
  });
  it.each(['count', 'duplicate', 'truncated', 'null', 'owner'])('rejects incomplete or unstable snapshots: %s', async mode => {
    const r = await seeded(); await r.start(); const response = stars([star(2)]);
    if (mode === 'count') response.data.viewer.starredRepositories.totalCount = 2;
    if (mode === 'duplicate') { response.data.viewer.starredRepositories.edges.push(star(2)); response.data.viewer.starredRepositories.totalCount = 2; }
    if (mode === 'truncated') response.data.viewer.starredRepositories.isOverLimit = true;
    if (mode === 'null') response.data.viewer.starredRepositories.edges.push(null);
    if (mode === 'owner') response.data.viewer.id = 'U_b';
    r.add(response); const state = await r.step(); expect(state.accounts[0]?.sync?.state).toBe('failed');
    expect(await check(r, db => db.list('repositories', 'U_a'))).toEqual([oldRepo]);
  });
  it('cancels a staged snapshot without changing current records', async () => {
    const r = await seeded(); await r.start(); r.add(stars([])); await r.step();
    await r.service.handle({ type: 'GIT_CANCEL_SYNC', accountId: 'U_a' }); const before = r.fetcher.mock.calls.length;
    await r.step(); expect(r.fetcher.mock.calls).toHaveLength(before);
    expect(await check(r, db => db.list('repositories', 'U_a'))).toEqual([oldRepo]);
  });
  it('keeps notes and tags when an unstarred repository leaves the snapshot', async () => {
    const r = await seeded(); await r.start(); r.add(stars([])); await r.step(); r.add(lists([])); await r.step(); await r.step();
    expect(await check(r, db => db.list('repositories', 'U_a'))).toEqual([]);
    expect(await check(r, db => db.list('repositoryTags', 'U_a'))).toHaveLength(1);
    expect((await check(r, db => db.list('handbooks', 'U_a')))[0]?.markdown).toBe('keep my notes');
  });
  it('reads no Lists and touches no categories under the stars-only rule', async () => {
    const r = await seeded(); await r.service.handle({ type: 'GIT_RULE_SAVE', accountId: 'U_a', mode: 'stars' });
    const db0 = await r.database();
    await db0.put('lists', 'U_a', { accountId: 'U_a', id: 'local:kept', name: '本地分类', description: null, isPrivate: false, syncedAt: '', source: 'manual' });
    await db0.put('memberships', 'U_a', { accountId: 'U_a', id: 'local:kept:R_1', listId: 'local:kept', repositoryId: 'R_1', source: 'manual' });
    db0.close();
    await r.start(); r.add(stars([star(1)], 1)); await r.step(); const state = await r.step();
    expect(state.accounts[0]?.sync?.state).toBe('succeeded');
    expect(state.accounts[0]?.syncMode).toBe('stars');
    expect(await check(r, db => db.list('lists', 'U_a'))).toHaveLength(1);
    expect(await check(r, db => db.list('memberships', 'U_a'))).toHaveLength(1);
    const queries = r.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/graphql')).map(([, init]) => JSON.parse(String(init?.body)).query);
    expect(queries.some((query: string) => query.includes('query Lists'))).toBe(false);
  });
  it('keeps a locally edited category while refreshing the ones still following the remote', async () => {
    const r = await seeded();
    const db = await r.database();
    await db.put('lists', 'U_a', { accountId: 'U_a', id: 'L_0', name: '我改的名字', description: '我的说明', isPrivate: false, syncedAt: '', source: 'remote', tracked: false });
    await db.put('lists', 'U_a', { accountId: 'U_a', id: 'L_1', name: 'List 1', description: null, isPrivate: false, syncedAt: '', source: 'remote', tracked: true });
    await db.put('memberships', 'U_a', { accountId: 'U_a', id: 'L_0:R_1', listId: 'L_0', repositoryId: 'R_1', source: 'remote' });
    db.close();
    await r.start(); r.add(stars([star(1)], 1)); await r.step();
    r.add(lists([list(0), list(1)], 2)); await r.step();
    r.add(items('L_0', [])); await r.step();
    r.add(items('L_1', [])); await r.step(); await r.step();
    const listsAfter = await check(r, db => db.list('lists', 'U_a'));
    expect(listsAfter.find(item => item.id === 'L_0')).toMatchObject({ name: '我改的名字', description: '我的说明', tracked: false });
    expect(listsAfter.find(item => item.id === 'L_1')).toMatchObject({ name: 'List 1', tracked: true });
    expect(await check(r, db => db.list('memberships', 'U_a'))).toHaveLength(1);
  });
  it('rolls back all tables and the success timestamp when a snapshot write fails', async () => {
    const r = await seeded(); const db = await r.database();
    const job = newSync('U_a', Date.now(), 'stars+lists'); const account = (await db.get('accounts', 'U_a', 'U_a'))!;
    const invalid = { ...list(1), accountId: 'U_a', syncedAt: '', uncloneable: () => 1 };
    await expect(db.commitSyncSnapshot({ ...account, lastSyncedAt: 'new' }, job, { repositories: [], lists: [invalid], memberships: [] }, 'stars+lists')).rejects.toThrow();
    expect(await db.list('repositories', 'U_a')).toEqual([oldRepo]); expect(await db.list('lists', 'U_a')).toEqual([]);
    expect((await db.get('accounts', 'U_a', 'U_a'))?.lastSyncedAt).toBeUndefined(); expect(await db.get('jobs', 'U_a', job.id)).toBeUndefined();
    db.close();
  });
});
