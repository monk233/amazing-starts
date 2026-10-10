import type { GiteeClient } from './client';
import type { Repository } from '../data/types';
import { GITEE_PREFIX, GitError, nullableText, record, text, type SyncJob } from '../git/types';

export const GITEE_SYNC_ID = 'gitee-sync';
export const GITEE_PAGE_SIZE = 100;
/** 页数上限只用于防止失控循环；正常账号远低于该限制。 */
export const GITEE_MAX_PAGES = 200;

export function newGiteeSync(accountId: string, now: number): SyncJob {
  return {
    accountId, id: GITEE_SYNC_ID, type: 'sync', targetId: accountId, state: 'running', deduplicationKey: GITEE_SYNC_ID,
    revision: 1, attempts: 0, nextRunAt: now, leaseUntil: null, phase: 'stars', cursor: null, cursors: [], total: null,
    listIndex: 0, itemCount: 0, draft: { repositories: [], lists: [], memberships: [] }, error: null,
    startedAt: new Date(now).toISOString(), mode: 'stars',
  };
}

function mapped(accountId: string, item: Record<string, unknown>, fetchedAt: string): Repository {
  const id = String(item.id ?? '');
  if (!/^[0-9]{1,32}$/.test(id)) throw new GitError('Gitee 返回的仓库标识无效，原快照未更新。');
  const pushedAt = typeof item.pushed_at === 'string' ? item.pushed_at : typeof item.updated_at === 'string' ? item.updated_at : null;
  return {
    accountId, id: GITEE_PREFIX + id, fullName: text(item.full_name),
    description: item.description === undefined ? null : nullableText(item.description),
    language: typeof item.language === 'string' && item.language ? item.language : null,
    // Gitee 没有 Topics，也没有 star 收藏时间；starredAt 留空，界面显示「暂无记录」。
    topics: [], starredAt: '', pushedAt, archived: false,
    visibility: item.private === true ? 'private' : 'public', fetchedAt,
  };
}

// 一页一次请求；调用方先把已完成的页面写入任务，再继续下一页。
export async function fetchGiteePage(client: GiteeClient, token: string, job: SyncJob): Promise<void> {
  if (job.phase !== 'stars') { job.phase = 'commit'; return; }
  const page = job.cursor === null ? 1 : Number(job.cursor);
  if (!Number.isSafeInteger(page) || page < 1 || page > GITEE_MAX_PAGES) throw new GitError('Gitee 分页进度无效，请重新同步。');
  const items = await client.starred(token, page, GITEE_PAGE_SIZE);
  for (const item of items) job.draft.repositories.push(mapped(job.accountId, record(item), job.startedAt));
  const seen = new Set<string>();
  for (const repository of job.draft.repositories) {
    if (seen.has(repository.id)) throw new GitError('Gitee 分页包含重复记录，请重新同步。');
    seen.add(repository.id);
  }
  // 少于整页即视为最后一页；Gitee 的集合接口没有可用于交叉校验的总量字段。
  job.cursor = items.length < GITEE_PAGE_SIZE ? null : String(page + 1);
  if (job.cursor === null) job.phase = 'commit';
  job.revision++;
}
