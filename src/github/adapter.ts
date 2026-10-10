import type { Account } from '../data/types';
import type { GitAdapter, SyncJob } from '../git/types';
import { GitHubClient } from './client';
import { fetchSyncPage, newSync, SYNC_ID } from './sync';

export class GitHubAdapter implements GitAdapter {
  readonly id = 'github' as const;
  readonly jobId = SYNC_ID;
  constructor(private readonly client = new GitHubClient()) {}

  verify(token: string): Promise<Account> {
    return this.client.verifyToken(token).then(account => ({ ...account, provider: 'github' }));
  }

  identity(token: string): Promise<Account> {
    return this.client.identity(token);
  }

  newJob(account: Account, now: number): SyncJob {
    return newSync(account.accountId, now, account.syncMode ?? 'stars+lists');
  }

  fetchPage(token: string, job: SyncJob): Promise<void> {
    return fetchSyncPage(this.client, token, job);
  }
}
