import type { Account, Job, List, Membership, Repository } from '../data/types';

export class GitHubError extends Error {
  constructor(message: string, readonly code = 'response', readonly retryAt?: number) { super(message); }
}
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new GitHubError('GitHub 返回的数据不完整，原快照未更新。');
  return value;
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length) throw new GitHubError('GitHub 返回的数据不完整，原快照未更新。');
  return value;
}
export function nullableText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new GitHubError('GitHub 返回的数据不完整，原快照未更新。');
  return value;
}
export function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new GitHubError('GitHub 返回的数据不完整，原快照未更新。');
  return value;
}
export interface Snapshot { repositories: Repository[]; lists: List[]; memberships: Membership[] }
export interface SyncJob extends Job {
  type: 'sync'; phase: 'stars' | 'lists' | 'items' | 'commit'; cursor: string | null;
  cursors: string[]; total: number | null; listIndex: number; itemCount: number;
  draft: Snapshot; error: string | null; startedAt: string;
}
export interface SyncStatus {
  state: Job['state']; phase: SyncJob['phase']; repositories: number; lists: number;
  memberships: number; error: string | null;
}
export interface GitHubState {
  kind: 'github';
  accounts: { account: Account; connected: boolean; remember: boolean; sync: SyncStatus | null }[];
}
export function isAccessToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_]{20,1024}$/.test(value);
}
export type GitHubMessage = { type: 'GITHUB_READ' } |
  { type: 'GITHUB_CONNECT'; token: string; remember: boolean } |
  { type: 'GITHUB_SYNC' | 'GITHUB_STEP' | 'GITHUB_CANCEL_SYNC' | 'GITHUB_DISCONNECT'; accountId: string };
export function githubMessage(input: Record<string, unknown>): GitHubMessage | null {
  if (input.type === 'GITHUB_READ' && Object.keys(input).length === 1) return { type: 'GITHUB_READ' };
  if (input.type === 'GITHUB_CONNECT' && Object.keys(input).length === 3 && isAccessToken(input.token) && typeof input.remember === 'boolean') return input as GitHubMessage;
  if (['GITHUB_SYNC', 'GITHUB_STEP', 'GITHUB_CANCEL_SYNC', 'GITHUB_DISCONNECT'].includes(String(input.type)) && Object.keys(input).length === 2 && typeof input.accountId === 'string' && /^[A-Za-z0-9_=:-]{1,180}$/.test(input.accountId)) return input as GitHubMessage;
  return null;
}
