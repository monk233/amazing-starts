import { IDBFactory } from 'fake-indexeddb';
import { vi } from 'vitest';
import { openDatabase } from '../../src/data/database';
import { GitHubClient } from '../../src/github/client';
import { GitHubService } from '../../src/github/service';
import { MemoryStorage } from '../helpers/storage';

export const ACCESS_TOKEN = 'test_personal_access_token_123';
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

export function rig() {
  let now = Date.parse('2026-10-10T00:00:00Z');
  const responses: Response[] = [];
  const fetcher = vi.fn<typeof fetch>(async () => {
    const response = responses.shift(); if (!response) throw new Error('Unexpected network request'); return response;
  });
  const local = new MemoryStorage(); const session = new MemoryStorage(); const factory = new IDBFactory();
  const database = () => openDatabase(factory);
  const restart = () => new GitHubService(local, session, new GitHubClient(fetcher, () => now), database, () => now);
  const service = restart();
  const add = (body: unknown, status = 200, headers: Record<string, string> = {}) => responses.push(new Response(JSON.stringify(body), { status, headers }));
  const advance = (ms = 5000) => { now += ms; };
  async function connect(id = 'U_a', remember = false, token = ACCESS_TOKEN) {
    add(user(id)); add(probe(id)); return service.handle({ type: 'GITHUB_CONNECT', token, remember });
  }
  async function start() { add(user()); return service.handle({ type: 'GITHUB_SYNC', accountId: 'U_a' }); }
  const step = (active = service) => active.handle({ type: 'GITHUB_STEP', accountId: 'U_a' });
  return { local, session, database, service, restart, fetcher, add, advance, connect, start, step };
}
