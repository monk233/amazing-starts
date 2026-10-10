import { CredentialVault } from '../data/credentials';
import { openDatabase, type LocalDatabase } from '../data/database';
import type { StorageArea } from '../data/storage';
import { GitHubClient } from './client';
import { emptyDraft, fetchSyncPage, newSync, SYNC_ID, syncStatus } from './sync';
import { GitHubError, isAccessToken, record, type GitHubMessage, type GitHubState, type SyncJob } from './types';

interface Credential {
  accessToken: string; remember: boolean; expiresAt: number | null;
}

export class GitHubService {
  private readonly vault: CredentialVault;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly local: StorageArea, private readonly session: StorageArea,
    private readonly client = new GitHubClient(), private readonly database = openDatabase, private readonly now = Date.now) {
    this.vault = new CredentialVault(local, session);
  }
  handle(message: GitHubMessage): Promise<GitHubState> {
    const operation = this.queue.then(async () => {
      const db = await this.database();
      try {
        if (message.type === 'GITHUB_CONNECT') await this.connect(db, message.token, message.remember);
        if (message.type === 'GITHUB_DISCONNECT') { await this.vault.forget(message.accountId, 'github'); await this.cancelSync(db, message.accountId); }
        if (message.type === 'GITHUB_CANCEL_SYNC') await this.cancelSync(db, message.accountId);
        if (message.type === 'GITHUB_SYNC') await this.startSync(db, message.accountId);
        if (message.type === 'GITHUB_STEP') await this.step(db, message.accountId);
        return await this.read(db);
      } catch (error: unknown) {
        if (error instanceof GitHubError && error.code === 'unauthorized' && 'accountId' in message) await this.vault.forget(message.accountId, 'github');
        throw error;
      } finally { db.close(); }
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  private async readCredential(accountId: string): Promise<Credential | null> {
    const stored = await this.vault.read(accountId, 'github');
    if (!stored) return null;
    try {
      const data = record(JSON.parse(stored));
      // Existing OAuth access tokens remain usable until expiry; new connections use PATs only.
      if (typeof data.accessToken !== 'string' || !data.accessToken || typeof data.remember !== 'boolean' ||
        data.expiresAt !== null && (typeof data.expiresAt !== 'number' || !Number.isFinite(data.expiresAt))) throw new Error();
      return { accessToken: data.accessToken, remember: data.remember, expiresAt: data.expiresAt as number | null };
    } catch { throw new GitHubError('本地 GitHub 凭证格式无效，请断开后重新填写 Access Token。'); }
  }
  private async read(db: LocalDatabase): Promise<GitHubState> {
    const accounts: GitHubState['accounts'] = [];
    for (const account of await db.accounts()) {
      const auth = await this.readCredential(account.accountId);
      const job = await db.get('jobs', account.accountId, SYNC_ID) as SyncJob | undefined;
      const connected = !!auth && (auth.expiresAt === null || auth.expiresAt > this.now());
      accounts.push({ account, connected, remember: auth?.remember ?? false, sync: job ? syncStatus(job) : null });
    }
    return { kind: 'github', accounts };
  }
  private async connect(db: LocalDatabase, token: string, remember: boolean) {
    if (!isAccessToken(token)) throw new GitHubError('请填写有效的 GitHub Personal Access Token。');
    const account = await this.client.verifyToken(token);
    const previous = await db.get('accounts', account.accountId, account.id);
    // Do not combine pages obtained with two credentials that may expose different repositories.
    await this.cancelSync(db, account.accountId);
    await db.put('accounts', account.accountId, { ...previous, ...account });
    await this.vault.save(account.accountId, 'github', JSON.stringify({ accessToken: token, remember, expiresAt: null } satisfies Credential), remember);
    await this.local.remove('github-client-id');
    await this.session.remove('github-device-flow');
  }
  private async token(accountId: string): Promise<string> {
    const auth = await this.readCredential(accountId);
    if (!auth) throw new GitHubError('请先为此 GitHub 账号填写 Access Token 并验证。', 'unauthorized');
    if (auth.expiresAt !== null && auth.expiresAt <= this.now()) throw new GitHubError('GitHub 凭证已过期，请更换 Access Token 并重新验证。', 'unauthorized');
    return auth.accessToken;
  }
  private async startSync(db: LocalDatabase, accountId: string) {
    const account = await db.get('accounts', accountId, accountId);
    if (!account) throw new GitHubError('账号不存在，请先填写 Access Token 并验证。');
    const existing = await db.get('jobs', accountId, SYNC_ID) as SyncJob | undefined;
    if (existing?.state === 'running') return;
    if (existing && existing.nextRunAt > this.now()) throw new GitHubError('GitHub 请求仍在限流等待期，请稍后重试。', 'rate_limit');
    const identity = await this.client.identity(await this.token(accountId));
    if (identity.accountId !== accountId) throw new GitHubError('GitHub 账号发生变化，请重新填写 Access Token 并验证。', 'account');
    await db.put('accounts', accountId, { ...account, ...identity });
    await db.put('jobs', accountId, newSync(accountId, this.now()));
  }
  private async cancelSync(db: LocalDatabase, accountId: string) {
    const job = await db.get('jobs', accountId, SYNC_ID) as SyncJob | undefined;
    if (job?.state === 'running') await db.put('jobs', accountId, { ...job, state: 'cancelled', draft: emptyDraft(), error: null } as SyncJob);
  }
  private async step(db: LocalDatabase, accountId: string) {
    const saved = await db.get('jobs', accountId, SYNC_ID) as SyncJob | undefined;
    if (!saved || saved.state !== 'running') return;
    const job = structuredClone(saved);
    try {
      const token = await this.token(accountId);
      if (job.phase !== 'commit') {
        await fetchSyncPage(this.client, token, job);
        await db.put('jobs', accountId, job);
        return;
      }
      const account = await db.get('accounts', accountId, accountId);
      if (!account) throw new GitHubError('本地账号不存在，同步已停止。');
      const ids = new Set(job.draft.repositories.map(repo => repo.id));
      job.draft.memberships = job.draft.memberships.filter(item => ids.has(item.repositoryId));
      const finishedAt = new Date(this.now()).toISOString();
      for (const repo of job.draft.repositories) repo.fetchedAt = finishedAt;
      for (const list of job.draft.lists) list.syncedAt = finishedAt;
      await db.commitGitHubSnapshot({ ...account, lastSyncedAt: finishedAt }, job.draft, { ...job, state: 'succeeded', draft: emptyDraft(), error: null } as SyncJob);
    } catch (error: unknown) {
      if (error instanceof GitHubError && error.code === 'unauthorized') await this.vault.forget(accountId, 'github');
      const message = error instanceof GitHubError ? error.message : '本地同步写入失败，原快照未更新，请重试。';
      await db.put('jobs', accountId, { ...saved, state: 'failed', draft: emptyDraft(), error: message, nextRunAt: error instanceof GitHubError ? error.retryAt ?? 0 : 0 } as SyncJob);
    }
  }
}
