export type AccountId = string;
export type Theme = 'folio' | 'observatory';
export type ColorMode = 'light' | 'dark' | 'system';
export interface Appearance { theme: Theme; mode: ColorMode }
export interface Settings { version: 1; appearance: Appearance }
export interface ScopedRecord { accountId: AccountId; id: string }
export interface Account extends ScopedRecord { login: string; avatarUrl: string }
export interface Repository extends ScopedRecord {
  fullName: string; description: string | null; language: string | null;
  topics: string[]; visibility: 'public' | 'private'; starredAt: string;
  pushedAt: string | null; archived: boolean; fetchedAt: string;
}
export interface List extends ScopedRecord {
  name: string; description: string | null; isPrivate: boolean; syncedAt: string;
}
export interface Membership extends ScopedRecord { repositoryId: string; listId: string }
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
