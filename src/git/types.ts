import type { Account, GitProvider, Job, Snapshot, SyncMode } from '../data/types';

export class GitError extends Error {
  constructor(message: string, readonly code = 'response', readonly retryAt?: number) { super(message); }
}
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new GitError('远端返回的数据不完整，原快照未更新。');
  return value;
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length) throw new GitError('远端返回的数据不完整，原快照未更新。');
  return value;
}
export function nullableText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new GitError('远端返回的数据不完整，原快照未更新。');
  return value;
}
export function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new GitError('远端返回的数据不完整，原快照未更新。');
  return value;
}

/** Gitee 账号 ID 带前缀，避免与 GitHub 的 node id 在同一个账号空间里冲突。 */
export const GITEE_PREFIX = 'gitee:';
export type SyncPhase = 'stars' | 'lists' | 'items' | 'commit';
export interface SyncJob extends Job {
  type: 'sync'; phase: SyncPhase; cursor: string | null; cursors: string[]; total: number | null;
  listIndex: number; itemCount: number; draft: Snapshot; error: string | null; startedAt: string; mode: SyncMode;
}
export interface SyncStatus {
  state: Job['state']; phase: SyncPhase; mode: SyncMode;
  repositories: number; lists: number; memberships: number; error: string | null;
}
export interface GitAccountState {
  account: Account; provider: GitProvider; syncMode: SyncMode;
  connected: boolean; remember: boolean; sync: SyncStatus | null;
}
export interface GitState { kind: 'git'; accounts: GitAccountState[] }

export function syncStatus(job: SyncJob): SyncStatus {
  return {
    state: job.state, phase: job.phase, mode: job.mode, error: job.error,
    repositories: job.draft.repositories.length, lists: job.draft.lists.length, memberships: job.draft.memberships.length,
  };
}

export type GitMessage =
  | { type: 'GIT_READ' }
  | { type: 'GIT_CONNECT'; provider: GitProvider; token: string; remember: boolean }
  | { type: 'GIT_SYNC' | 'GIT_STEP' | 'GIT_CANCEL_SYNC' | 'GIT_DISCONNECT'; accountId: string }
  | { type: 'GIT_RULE_SAVE'; accountId: string; mode: SyncMode }
  | { type: 'GIT_CATEGORY_SAVE'; accountId: string; id: string | null; name: string; description: string }
  | { type: 'GIT_CATEGORY_DELETE'; accountId: string; categoryId: string }
  | { type: 'GIT_CATEGORY_MOVE'; accountId: string; repositoryId: string; categoryId: string | null };

const ACCOUNT_ID = /^[A-Za-z0-9_=:-]{1,180}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const TOKEN: Record<GitProvider, RegExp> = {
  github: /^[A-Za-z0-9_]{20,1024}$/,
  gitee: /^[A-Za-z0-9_-]{8,1024}$/,
};
export const isGitToken = (provider: GitProvider, value: unknown): value is string =>
  typeof value === 'string' && TOKEN[provider].test(value);
export const isGitProvider = (value: unknown): value is GitProvider => value === 'github' || value === 'gitee';
export const isSyncMode = (value: unknown): value is SyncMode => value === 'stars' || value === 'stars+lists';

const identifier = (value: unknown): value is string => typeof value === 'string' && ACCOUNT_ID.test(value);
const label = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !CONTROL.test(value);

/** 只接受固定字段的消息；任何多余字段都视为不受信任。 */
export function gitMessage(input: Record<string, unknown>): GitMessage | null {
  const size = Object.keys(input).length;
  if (input.type === 'GIT_READ' && size === 1) return { type: 'GIT_READ' };
  if (input.type === 'GIT_CONNECT' && size === 4 && isGitProvider(input.provider) && isGitToken(input.provider, input.token) && typeof input.remember === 'boolean') {
    return { type: 'GIT_CONNECT', provider: input.provider, token: input.token, remember: input.remember };
  }
  if (['GIT_SYNC', 'GIT_STEP', 'GIT_CANCEL_SYNC', 'GIT_DISCONNECT'].includes(String(input.type)) && size === 2 && identifier(input.accountId)) return input as GitMessage;
  if (input.type === 'GIT_RULE_SAVE' && size === 3 && identifier(input.accountId) && isSyncMode(input.mode)) return input as GitMessage;
  if (input.type === 'GIT_CATEGORY_SAVE' && size === 5 && identifier(input.accountId) &&
    (input.id === null || identifier(input.id)) && label(input.name, 80) && label(input.description, 500)) return input as GitMessage;
  if (input.type === 'GIT_CATEGORY_DELETE' && size === 3 && identifier(input.accountId) && identifier(input.categoryId)) return input as GitMessage;
  if (input.type === 'GIT_CATEGORY_MOVE' && size === 4 && identifier(input.accountId) && identifier(input.repositoryId) &&
    (input.categoryId === null || identifier(input.categoryId))) return input as GitMessage;
  return null;
}
