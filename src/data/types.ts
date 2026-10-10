export type AccountId = string;
export type Theme = 'folio' | 'observatory';
export type ColorMode = 'light' | 'dark' | 'system';
/** 远端代码托管平台。旧记录没有该字段时按 GitHub 解释。 */
export type GitProvider = 'github' | 'gitee';
/** 同步规则：只同步 stars，或同步 stars 并按远端 Lists 维护分类。 */
export type SyncMode = 'stars' | 'stars+lists';
/** 分类来源：远端导入或本地手动创建。 */
export type CategorySource = 'remote' | 'manual';
export interface Appearance { theme: Theme; mode: ColorMode }
export interface Settings { version: 1; appearance: Appearance }
export interface ScopedRecord { accountId: AccountId; id: string }
export interface Account extends ScopedRecord {
  login: string; avatarUrl: string; lastSyncedAt?: string;
  provider?: GitProvider; syncMode?: SyncMode;
}
export interface Repository extends ScopedRecord {
  fullName: string; description: string | null; language: string | null;
  topics: string[]; visibility: 'public' | 'private'; starredAt: string;
  pushedAt: string | null; archived: boolean; fetchedAt: string;
}
export interface List extends ScopedRecord {
  name: string; description: string | null; isPrivate: boolean; syncedAt: string;
  source?: CategorySource;
  /** 仅远端来源分类有意义：true 表示仍跟随远端同步，本地修改后为 false。 */
  tracked?: boolean;
}
export interface Membership extends ScopedRecord {
  repositoryId: string; listId: string; source?: CategorySource;
}
/** 一次完整读取后得到的结果集；缺项必须由调用方补齐，不能提交部分快照。 */
export interface Snapshot { repositories: Repository[]; lists: List[]; memberships: Membership[] }
export interface Dimension extends ScopedRecord { name: string; description: string; order: number }
export interface Tag extends ScopedRecord { dimensionId: string; name: string; color: string }
export interface RepositoryTag extends ScopedRecord {
  repositoryId: string; tagId: string; source: 'manual' | 'ai';
}
export interface ManualOverride extends ScopedRecord {
  repositoryId: string; protectedListIds: string[]; excludedListIds: string[];
  protectedTagIds: string[]; revision: number; updatedAt: string;
}
export interface Handbook extends ScopedRecord {
  title: string; repositoryIds: string[]; template: string; markdown: string;
  source: 'manual' | 'ai'; revision: number; updatedAt: string;
}
export interface Comparison extends ScopedRecord {
  repositoryIds: string[]; facts: Record<string, unknown>[];
  analysis: string | null; fetchedAt: string;
}
export type JobState = 'queued' | 'running' | 'retry_wait' | 'needs_review' | 'succeeded' | 'failed' | 'cancelled';
export interface Job extends ScopedRecord {
  type: 'classify' | 'sync' | 'merge' | 'activity'; targetId: string;
  state: JobState; deduplicationKey: string; revision: number; attempts: number;
  nextRunAt: number; leaseUntil: number | null;
}
export interface Activity extends ScopedRecord {
  repositoryId: string; kind: 'release' | 'archived' | 'pushed';
  previousValue: string | null; value: string; occurredAt: string | null;
  discoveredAt: string; read: boolean;
}
export interface Tables {
  accounts: Account; repositories: Repository; lists: List; memberships: Membership;
  dimensions: Dimension; tags: Tag; repositoryTags: RepositoryTag;
  manualOverrides: ManualOverride; handbooks: Handbook; comparisons: Comparison;
  jobs: Job; activities: Activity;
}
export type Table = keyof Tables;

export const accountProvider = (account: Account): GitProvider => account.provider ?? 'github';

/** Gitee 没有 Lists 概念，因此只支持只同步 stars 的规则。 */
export const accountSyncMode = (account: Account): SyncMode =>
  account.provider === 'gitee' ? 'stars' : account.syncMode ?? 'stars+lists';

export const listSource = (list: List): CategorySource => list.source ?? 'remote';
export const listTracked = (list: List): boolean => listSource(list) === 'remote' && list.tracked !== false;
export const membershipSource = (membership: Membership): CategorySource => membership.source ?? 'remote';
