import type { Account } from '../data/types';
import type { GitAdapter, SyncJob } from '../git/types';
import { GiteeClient } from './client';
import { fetchGiteePage, GITEE_SYNC_ID, newGiteeSync } from './sync';

export class GiteeAdapter implements GitAdapter {
  readonly id = 'gitee' as const;
  readonly jobId = GITEE_SYNC_ID;
  constructor(private readonly client = new GiteeClient()) {}

  async verify(token: string): Promise<Account> {
    return (await this.client.verifyToken(token)).account;
  }

  async identity(token: string): Promise<Account> {
    return (await this.client.profile(token)).account;
  }

  newJob(account: Account, now: number): SyncJob {
    return newGiteeSync(account.accountId, now);
  }

  fetchPage(token: string, job: SyncJob): Promise<void> {
    return fetchGiteePage(this.client, token, job);
  }
}
