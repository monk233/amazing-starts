import type { GitHubClient } from './client';
import type { SyncMode } from '../data/types';
import { GitError, flag, nullableText, record, text, type SyncJob } from '../git/types';

export const SYNC_ID = 'github-sync';
const pageInfo = 'totalCount pageInfo { hasNextPage endCursor }';
export const STARS_QUERY = `query Stars($cursor: String) { viewer { id starredRepositories(first: 100, after: $cursor, orderBy: {field: STARRED_AT, direction: ASC}) {
  ${pageInfo} isOverLimit edges { starredAt node { id nameWithOwner description isPrivate isArchived pushedAt
  primaryLanguage { name } repositoryTopics(first: 100) { totalCount nodes { topic { name } } } } }
} } }`;
export const LISTS_QUERY = `query Lists($cursor: String) { viewer { id lists(first: 100, after: $cursor) { ${pageInfo} nodes { id name description isPrivate } } } }`;
export const ITEMS_QUERY = `query ListItems($id: ID!, $cursor: String) { viewer { id } node(id: $id) { ... on UserList { id user { id } items(first: 100, after: $cursor) { ${pageInfo} nodes { __typename ... on Repository { id } } } } } }`;
export const emptyDraft = () => ({ repositories: [], lists: [], memberships: [] });
export function newSync(accountId: string, now: number, mode: SyncMode = 'stars+lists'): SyncJob {
  return { accountId, id: SYNC_ID, type: 'sync', targetId: accountId, state: 'running', deduplicationKey: SYNC_ID,
    revision: 1, attempts: 0, nextRunAt: now, leaseUntil: null, phase: 'stars', cursor: null, cursors: [], total: null,
    listIndex: 0, itemCount: 0, draft: emptyDraft(), error: null, startedAt: new Date(now).toISOString(), mode };
}
function nodes(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new GitError('GitHub 返回的分页数据不完整。');
  return value.map(record);
}
function checkOwner(data: Record<string, unknown>, accountId: string) {
  if (record(data.viewer).id !== accountId) throw new GitError('GitHub 账号发生变化，已停止同步，请重新登录。', 'account');
}
function advance(job: SyncJob, connection: Record<string, unknown>, count: number): boolean {
  const total = connection.totalCount;
  if (!Number.isSafeInteger(total) || Number(total) < 0 || job.total !== null && job.total !== total) throw new GitError('GitHub 集合在同步期间发生变化，请重新同步。');
  job.total = Number(total);
  const info = record(connection.pageInfo);
  const more = flag(info.hasNextPage);
  if (count > job.total || !more && count !== job.total) throw new GitError('GitHub 分页数量不完整，请重新同步。');
  if (more) {
    const cursor = text(info.endCursor);
    if (count >= job.total || job.cursors.includes(cursor)) throw new GitError('GitHub 分页游标无效，已停止同步。');
    job.cursors.push(cursor); job.cursor = cursor;
  } else { job.cursor = null; job.cursors = []; job.total = null; }
  return more;
}
function unique(ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new GitError('GitHub 分页包含重复记录，请重新同步。');
}

// One bounded request per step; the caller persists each completed page before acknowledging it.
export async function fetchSyncPage(client: GitHubClient, token: string, job: SyncJob): Promise<void> {
  const accountId = job.accountId;
  if (job.phase === 'stars') {
    const data = await client.graphql(token, STARS_QUERY, { cursor: job.cursor }); checkOwner(data, accountId);
    const connection = record(record(data.viewer).starredRepositories);
    if (flag(connection.isOverLimit)) throw new GitError('GitHub 标记此账号的 Stars 结果被截断，无法提交完整快照。');
    for (const edge of nodes(connection.edges)) {
      const repo = record(edge.node); const topics = record(repo.repositoryTopics); const topicNodes = nodes(topics.nodes);
      if (topics.totalCount !== topicNodes.length) throw new GitError('GitHub Topics 数据不完整，原快照未更新。');
      job.draft.repositories.push({ accountId, id: text(repo.id), fullName: text(repo.nameWithOwner), description: nullableText(repo.description),
        language: repo.primaryLanguage === null ? null : text(record(repo.primaryLanguage).name), topics: topicNodes.map(item => text(record(item.topic).name)),
        visibility: flag(repo.isPrivate) ? 'private' : 'public', archived: flag(repo.isArchived), starredAt: text(edge.starredAt), pushedAt: nullableText(repo.pushedAt), fetchedAt: job.startedAt });
    }
    unique(job.draft.repositories.map(repo => repo.id));
    // 只同步 stars 的规则在这里直接进入提交，不读取也不改动任何分类。
    if (!advance(job, connection, job.draft.repositories.length)) job.phase = job.mode === 'stars+lists' ? 'lists' : 'commit';
  } else if (job.phase === 'lists') {
    const data = await client.graphql(token, LISTS_QUERY, { cursor: job.cursor }); checkOwner(data, accountId);
    const connection = record(record(data.viewer).lists);
    for (const list of nodes(connection.nodes)) job.draft.lists.push({ accountId, id: text(list.id), name: text(list.name), description: nullableText(list.description), isPrivate: flag(list.isPrivate), syncedAt: job.startedAt });
    unique(job.draft.lists.map(list => list.id));
    if (!advance(job, connection, job.draft.lists.length)) job.phase = job.draft.lists.length ? 'items' : 'commit';
  } else if (job.phase === 'items') {
    const list = job.draft.lists[job.listIndex];
    if (!list) throw new GitError('同步进度不完整，请重新同步。');
    const data = await client.graphql(token, ITEMS_QUERY, { id: list.id, cursor: job.cursor }); checkOwner(data, accountId);
    const node = record(data.node);
    if (node.id !== list.id || record(node.user).id !== accountId) throw new GitError('GitHub List 已变化，已停止同步。');
    const connection = record(node.items); const items = nodes(connection.nodes);
    for (const item of items) {
      if (item.__typename !== 'Repository') throw new GitError('GitHub List 包含暂不支持的项目类型。');
      const repositoryId = text(item.id);
      job.draft.memberships.push({ accountId, id: list.id + ':' + repositoryId, listId: list.id, repositoryId });
    }
    unique(job.draft.memberships.map(item => item.id));
    job.itemCount += items.length;
    if (!advance(job, connection, job.itemCount)) { job.listIndex++; job.itemCount = 0; if (job.listIndex === job.draft.lists.length) job.phase = 'commit'; }
  }
  job.revision++;
}
