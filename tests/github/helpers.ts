import { IDBFactory } from 'fake-indexeddb';
import { vi } from 'vitest';
import { openDatabase } from '../../src/data/database';
import { GitService } from '../../src/git/service';
import { GiteeAdapter } from '../../src/gitee/adapter';
import { GiteeClient } from '../../src/gitee/client';
import { GitHubAdapter } from '../../src/github/adapter';
import { GitHubClient } from '../../src/github/client';
import { MemoryStorage } from '../helpers/storage';

export const ACCESS_TOKEN = 'test_personal_access_token_123';
export const GITEE_TOKEN = 'test_gitee_private_token_456';
export const GITEE_ACCOUNT = 'gitee:1001';
export const user = (id = 'U_a') => ({ node_id: id, login: id, avatar_url: 'https://avatars.githubusercontent.com/u/1' });
export const probe = (id = 'U_a') => ({ data: { viewer: { id, starredRepositories: { totalCount: 1 }, lists: { totalCount: 1, nodes: [{ id: 'L_0', items: { totalCount: 1 } }] } } } });
export const connection = (nodes: unknown[], totalCount = nodes.length, more = false, endCursor: string | null = null) => ({ nodes, totalCount, pageInfo: { hasNextPage: more, endCursor } });
export const star = (id: number | string) => ({ starredAt: '2026-10-10T00:00:00Z', node: {
  id: 'R_' + id, nameWithOwner: 'owner/repo-' + id, description: 'repository', isPrivate: false, isArchived: false,
  pushedAt: null, primaryLanguage: { name: 'TypeScript' }, repositoryTopics: connection([]),
} });
export const stars = (edges: unknown[], totalCount = edges.length, more = false, cursor: string | null = null) => ({ data: { viewer: { id: 'U_a', starredRepositories: { ...connection([], totalCount, more, cursor), edges, isOverLimit: false } } } });
export const list = (id: number) => ({ id: 'L_' + id, name: 'List ' + id, description: null, isPrivate: false });
export const lists = (nodes: unknown[], totalCount = nodes.length, more = false, cursor: string | null = null) => ({ data: { viewer: { id: 'U_a', lists: connection(nodes, totalCount, more, cursor) } } });
export const items = (id: string, ids: number[], totalCount = ids.length, more = false, cursor: string | null = null) => ({ data: { viewer: { id: 'U_a' }, node: { id, user: { id: 'U_a' }, items: connection(ids.map(id => ({ __typename: 'Repository', id: 'R_' + id })), totalCount, more, cursor) } } });
export const giteeUser = (id = 1001, starred = 1) => ({ id, login: 'gitee-user-' + id, name: 'Gitee User', avatar_url: 'https://gitee.com/assets/no_portrait.png', stared: starred });
export const giteeRepo = (id: number) => ({ id, full_name: 'owner/repo-' + id, description: 'repository', private: false, language: 'Go', updated_at: '2026-10-10T00:00:00Z', pushed_at: '2026-10-09T00:00:00Z' });

export function rig() {
  let now = Date.parse('2026-10-10T00:00:00Z');
  const responses: Response[] = [];
  const fetcher = vi.fn<typeof fetch>(async () => {
    const response = responses.shift(); if (!response) throw new Error('Unexpected network request'); return response;
  });
  const local = new MemoryStorage(); const session = new MemoryStorage(); const factory = new IDBFactory();
  const database = () => openDatabase(factory);
  const restart = () => new GitService(local, session, database, () => now, {
    github: new GitHubAdapter(new GitHubClient(fetcher, () => now)),
    gitee: new GiteeAdapter(new GiteeClient(fetcher, () => now)),
  });
  const service = restart();
  const add = (body: unknown, status = 200, headers: Record<string, string> = {}) => responses.push(new Response(JSON.stringify(body), { status, headers }));
  const advance = (ms = 5000) => { now += ms; };
  async function connect(id = 'U_a', remember = false, token = ACCESS_TOKEN) {
    add(user(id)); add(probe(id)); return service.handle({ type: 'GIT_CONNECT', provider: 'github', token, remember });
  }
  async function connectGitee(id = 1001, remember = false, token = GITEE_TOKEN) {
    add(giteeUser(id)); add([giteeRepo(1)]); return service.handle({ type: 'GIT_CONNECT', provider: 'gitee', token, remember });
  }
  async function start() { add(user()); return service.handle({ type: 'GIT_SYNC', accountId: 'U_a' }); }
  async function startGitee(accountId = GITEE_ACCOUNT) { add(giteeUser()); return service.handle({ type: 'GIT_SYNC', accountId }); }
  const step = (active = service, accountId = 'U_a') => active.handle({ type: 'GIT_STEP', accountId });
  return { local, session, database, service, restart, fetcher, add, advance, connect, connectGitee, start, startGitee, step };
}
