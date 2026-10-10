import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase, type LocalDatabase } from '../../src/data/database';
import { filterRepositories, initialFilters, readLibrary, repositoryUrl, type Library } from '../../src/library/library';
import type { Repository } from '../../src/data/types';
const repository = (id: string, patch: Partial<Repository> = {}): Repository => ({
  accountId: 'a', id, fullName: 'owner/' + id, description: 'Fast search toolkit', language: 'TypeScript',
  topics: ['search'], visibility: 'public', starredAt: '2026-10-01T00:00:00Z', pushedAt: null,
  archived: false, fetchedAt: '2026-10-10T00:00:00Z', ...patch,
});
const data: Library = {
  kind: 'library', accounts: [], accountId: 'a',
  repositories: [repository('alpha'), repository('beta', { language: 'Python', visibility: 'private', archived: true, starredAt: '2026-10-08T00:00:00Z', pushedAt: '2026-10-09T00:00:00Z' }), repository('gamma', { language: null, description: null, topics: [] })],
  lists: [{ accountId: 'a', id: 'tools', name: '工具', description: null, isPrivate: false, syncedAt: '' }],
  memberships: [{ accountId: 'a', id: 'm', listId: 'tools', repositoryId: 'alpha' }],
  dimensions: [{ accountId: 'a', id: 'purpose', name: '用途', description: '', order: 0 }, { accountId: 'a', id: 'stage', name: '阶段', description: '', order: 1 }],
  tags: [{ accountId: 'a', id: 'search', dimensionId: 'purpose', name: '检索', color: '' }, { accountId: 'a', id: 'ai', dimensionId: 'purpose', name: 'AI', color: '' }, { accountId: 'a', id: 'using', dimensionId: 'stage', name: '使用中', color: '' }],
  repositoryTags: [
    { accountId: 'a', id: '1', repositoryId: 'alpha', tagId: 'search', source: 'manual' },
    { accountId: 'a', id: '2', repositoryId: 'beta', tagId: 'ai', source: 'ai' },
    { accountId: 'a', id: '3', repositoryId: 'alpha', tagId: 'using', source: 'manual' },
  ],
};
const ids = (patch: Partial<typeof initialFilters>) => filterRepositories(data, { ...initialFilters, ...patch }).map(repo => repo.id);
describe('本地收藏筛选', () => {
  it('searches names, descriptions, topics and tags case-insensitively with all words required', () => {
    expect(ids({ query: 'OWNER/ALPHA search' })).toEqual(['alpha']);
    expect(ids({ query: '检索' })).toEqual(['alpha']);
    expect(ids({ query: 'search absent' })).toEqual([]);
    expect(ids({ query: '  ' })).toHaveLength(3);
  });
  it('unions tags in one dimension and intersects different dimensions', () => {
    expect(ids({ tagIds: ['search', 'ai'] })).toEqual(['beta', 'alpha']);
    expect(ids({ tagIds: ['search', 'ai', 'using'] })).toEqual(['alpha']);
    expect(ids({ tagIds: ['ai', 'using'] })).toEqual([]);
  });
  it('combines list, language, visibility and archived conditions', () => {
    expect(ids({ listId: 'tools', language: 'TypeScript', archived: 'false', visibility: 'public' })).toEqual(['alpha']);
    expect(ids({ listId: '__unlisted' })).toEqual(['beta', 'gamma']);
    expect(ids({ language: '__none' })).toEqual(['gamma']);
    expect(ids({ visibility: 'private', archived: 'true' })).toEqual(['beta']);
  });
  it('sorts dates and names without mutating the snapshot', () => {
    expect(ids({ sort: 'starred' })).toEqual(['beta', 'alpha', 'gamma']);
    expect(ids({ sort: 'updated' })).toEqual(['beta', 'alpha', 'gamma']);
    expect(ids({ sort: 'name' })).toEqual(['alpha', 'beta', 'gamma']);
    expect(data.repositories.map(repo => repo.id)).toEqual(['alpha', 'beta', 'gamma']);
  });
  it('builds links only for valid GitHub repository names', () => {
    expect(repositoryUrl('owner/repo')).toBe('https://github.com/owner/repo');
    for (const name of ['javascript:alert(1)', 'evil.test/a/b', 'owner/..', 'owner/repo?x', '<svg>/x']) expect(repositoryUrl(name)).toBeNull();
  });
});
describe('本地收藏读取与账号隔离', () => {
  let db: LocalDatabase;
  beforeEach(async () => { db = await openDatabase(new IDBFactory()); });
  afterEach(() => db.close());
  it('returns an empty workspace without creating demo records', async () => {
    expect(await readLibrary(db, null)).toMatchObject({ accountId: null, accounts: [], repositories: [], tags: [] });
    expect(await db.accounts()).toEqual([]);
  });
  it('reads every related table only from the selected account', async () => {
    for (const accountId of ['a', 'b']) {
      await db.put('accounts', accountId, { id: accountId, accountId, login: accountId, avatarUrl: '' });
      await db.put('repositories', accountId, repository('shared', { accountId, description: accountId }));
      await db.put('tags', accountId, { accountId, id: 't', name: accountId, dimensionId: 'd', color: '' });
      await db.put('memberships', accountId, { accountId, id: 'm', listId: accountId, repositoryId: 'shared' });
    }
    expect((await readLibrary(db, null)).accountId).toBe('a');
    const result = await readLibrary(db, 'b');
    expect(result.accounts).toHaveLength(2);
    expect(result.repositories.map(repo => repo.description)).toEqual(['b']);
    expect(result.tags.map(tag => tag.name)).toEqual(['b']);
    expect(result.memberships.map(link => link.listId)).toEqual(['b']);
  });
  it('rejects unknown accounts rather than silently showing another account', async () => {
    await expect(readLibrary(db, 'unknown')).rejects.toThrow('本地账号不存在');
  });
});
