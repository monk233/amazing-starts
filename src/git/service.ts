import { CredentialVault } from '../data/credentials';
import { openDatabase, type LocalDatabase } from '../data/database';
import type { StorageArea } from '../data/storage';
import type { GitProvider } from '../data/types';
import { accountProvider, accountSyncMode } from '../data/types';
import { GiteeAdapter } from '../gitee/adapter';
import { GitHubAdapter } from '../github/adapter';
import { deleteCategory, moveRepository, saveCategory } from '../library/categories';
import { emptyDraft, GitError, isRecord, syncStatus, type GitAdapter, type GitMessage, type GitState, type SyncJob } from './types';

interface Credential {
  accessToken: string; remember: boolean; expiresAt: number | null;
}

const LABEL: Record<GitProvider, string> = { github: 'GitHub Access Token', gitee: 'Gitee 私人令牌' };

export class GitService {
  private readonly vault: CredentialVault;
  private readonly adapters: Record<GitProvider, GitAdapter>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly local: StorageArea, private readonly session: StorageArea,
    private readonly database = openDatabase, private readonly now = Date.now,
    adapters: Record<GitProvider, GitAdapter> = { github: new GitHubAdapter(), gitee: new GiteeAdapter() }) {
    this.vault = new CredentialVault(local, session);
    this.adapters = adapters;
  }

  handle(message: GitMessage): Promise<GitState> {
    const operation = this.queue.then(async () => {
      const db = await this.database();
      try {
        if (message.type === 'GIT_CONNECT') await this.connect(db, message.provider, message.token, message.remember);
        if (message.type === 'GIT_DISCONNECT') { await this.vault.forget(message.accountId, await this.providerOf(db, message.accountId)); await this.cancelSync(db, message.accountId); }
        if (message.type === 'GIT_CANCEL_SYNC') await this.cancelSync(db, message.accountId);
        if (message.type === 'GIT_SYNC') await this.startSync(db, message.accountId);
        if (message.type === 'GIT_STEP') await this.step(db, message.accountId);
        if (message.type === 'GIT_RULE_SAVE') await this.saveRule(db, message.accountId, message.mode);
        if (message.type === 'GIT_CATEGORY_SAVE') await saveCategory(db, await this.requiredAccount(db, message.accountId), { id: message.id, name: message.name, description: message.description });
        if (message.type === 'GIT_CATEGORY_DELETE') await deleteCategory(db, await this.requiredAccount(db, message.accountId), message.categoryId);
        if (message.type === 'GIT_CATEGORY_MOVE') await moveRepository(db, await this.requiredAccount(db, message.accountId), message.repositoryId, message.categoryId);
        return await this.read(db);
      } catch (error: unknown) {
        if (error instanceof GitError && error.code === 'unauthorized' && 'accountId' in message) {
          await this.vault.forget(message.accountId, await this.providerOf(db, message.accountId)).catch(() => undefined);
        }
        throw error;
      } finally { db.close(); }
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private adapter(provider: GitProvider): GitAdapter { return this.adapters[provider]; }

  private async requiredAccount(db: LocalDatabase, accountId: string): Promise<string> {
    if (!await db.get('accounts', accountId, accountId)) throw new GitError('账号不存在，请先连接 Git 账号。');
    return accountId;
  }

  private async providerOf(db: LocalDatabase, accountId: string): Promise<GitProvider> {
    const account = await db.get('accounts', accountId, accountId);
    return account ? accountProvider(account) : 'github';
  }

  private async readCredential(accountId: string, provider: GitProvider): Promise<Credential | null> {
    const stored = await this.vault.read(accountId, provider);
    if (!stored) return null;
    try {
      const data = JSON.parse(stored) as unknown;
      if (!isRecord(data)) throw new Error();
      // Existing OAuth access tokens remain usable until expiry; new connections use PATs only.
      if (typeof data.accessToken !== 'string' || !data.accessToken || typeof data.remember !== 'boolean' ||
        data.expiresAt !== null && (typeof data.expiresAt !== 'number' || !Number.isFinite(data.expiresAt))) throw new Error();
      return { accessToken: data.accessToken, remember: data.remember, expiresAt: data.expiresAt as number | null };
    } catch { throw new GitError('本地凭证格式无效，请断开后重新填写令牌。'); }
  }

  private async read(db: LocalDatabase): Promise<GitState> {
    const accounts: GitState['accounts'] = [];
    for (const account of await db.accounts()) {
      const provider = accountProvider(account);
      const auth = await this.readCredential(account.accountId, provider);
      const job = await db.get('jobs', account.accountId, this.adapter(provider).jobId) as SyncJob | undefined;
      const connected = !!auth && (auth.expiresAt === null || auth.expiresAt > this.now());
      accounts.push({
        account, provider, syncMode: accountSyncMode(account), connected, remember: auth?.remember ?? false,
        sync: job ? syncStatus({ ...job, mode: job.mode ?? accountSyncMode(account) }) : null,
      });
    }
    return { kind: 'git', accounts };
  }

  private async connect(db: LocalDatabase, provider: GitProvider, token: string, remember: boolean) {
    const account = { ...(await this.adapter(provider).verify(token)), provider };
    const accountId = account.accountId;
    const previous = await db.get('accounts', accountId, accountId);
    const syncMode = previous?.syncMode ?? accountSyncMode({ ...account, provider });
    // Do not combine pages obtained with two credentials that may expose different repositories.
    await this.cancelSync(db, accountId);
    await db.put('accounts', accountId, { ...previous, ...account, provider, syncMode });
    await this.vault.save(accountId, provider, JSON.stringify({ accessToken: token, remember, expiresAt: null } satisfies Credential), remember);
    await this.local.remove('github-client-id');
    await this.session.remove('github-device-flow');
  }

  private async token(accountId: string, provider: GitProvider): Promise<string> {
    const auth = await this.readCredential(accountId, provider);
    if (!auth) throw new GitError(`请先为此账号填写 ${LABEL[provider]} 并验证。`, 'unauthorized');
    if (auth.expiresAt !== null && auth.expiresAt <= this.now()) throw new GitError('凭证已过期，请更换令牌并重新验证。', 'unauthorized');
    return auth.accessToken;
  }

  private async startSync(db: LocalDatabase, accountId: string) {
    const account = await db.get('accounts', accountId, accountId);
    if (!account) throw new GitError('账号不存在，请先填写令牌并验证。');
    const provider = accountProvider(account);
    const adapter = this.adapter(provider);
    const existing = await db.get('jobs', accountId, adapter.jobId) as SyncJob | undefined;
    if (existing?.state === 'running') return;
    if (existing && existing.nextRunAt > this.now()) throw new GitError('远端请求仍在限流等待期，请稍后重试。', 'rate_limit');
    const identity = await adapter.identity(await this.token(accountId, provider));
    if (identity.accountId !== accountId) throw new GitError('账号发生变化，请重新填写令牌并验证。', 'account');
    await db.put('accounts', accountId, { ...account, ...identity, provider });
    await db.put('jobs', accountId, adapter.newJob({ ...account, syncMode: accountSyncMode(account) }, this.now()));
  }

  private async cancelSync(db: LocalDatabase, accountId: string) {
    const account = await db.get('accounts', accountId, accountId);
    const jobId = this.adapter(account ? accountProvider(account) : 'github').jobId;
    const job = await db.get('jobs', accountId, jobId) as SyncJob | undefined;
    if (job?.state === 'running') await db.put('jobs', accountId, { ...job, state: 'cancelled', draft: emptyDraft(), error: null } as SyncJob);
  }

  private async saveRule(db: LocalDatabase, accountId: string, mode: GitState['accounts'][number]['syncMode']) {
    const account = await db.get('accounts', accountId, accountId);
    if (!account) throw new GitError('账号不存在，请先连接 Git 账号。');
    const provider = accountProvider(account);
    if (provider === 'gitee' && mode !== 'stars') throw new GitError('Gitee 没有 Lists，只支持「只同步 Stars」规则。');
    if (accountSyncMode(account) === mode) return;
    // 切换规则会改变快照的含义，未完成的同步先取消，避免用旧规则的数据提交。
    await this.cancelSync(db, accountId);
    await db.put('accounts', accountId, { ...account, syncMode: mode });
  }

  private async step(db: LocalDatabase, accountId: string) {
    const account = await db.get('accounts', accountId, accountId);
    if (!account) return;
    const provider = accountProvider(account);
    const adapter = this.adapter(provider);
    const saved = await db.get('jobs', accountId, adapter.jobId) as SyncJob | undefined;
    if (!saved || saved.state !== 'running') return;
    const job = structuredClone({ ...saved, mode: saved.mode ?? accountSyncMode(account) });
    try {
      const token = await this.token(accountId, provider);
      if (job.phase !== 'commit') {
        await adapter.fetchPage(token, job);
        await db.put('jobs', accountId, job);
        return;
      }
      const ids = new Set(job.draft.repositories.map(repo => repo.id));
      job.draft.memberships = job.draft.memberships.filter(item => ids.has(item.repositoryId));
      const finishedAt = new Date(this.now()).toISOString();
      for (const repo of job.draft.repositories) repo.fetchedAt = finishedAt;
      for (const list of job.draft.lists) list.syncedAt = finishedAt;
      await db.commitSyncSnapshot({ ...account, lastSyncedAt: finishedAt }, { ...job, state: 'succeeded', draft: emptyDraft(), error: null } as SyncJob, job.draft, job.mode);
    } catch (error: unknown) {
      if (error instanceof GitError && error.code === 'unauthorized') await this.vault.forget(accountId, provider);
      const message = error instanceof GitError ? error.message : '本地同步写入失败，原快照未更新，请重试。';
      await db.put('jobs', accountId, { ...saved, mode: job.mode, state: 'failed', draft: emptyDraft(), error: message, nextRunAt: error instanceof GitError ? error.retryAt ?? 0 : 0 } as SyncJob);
    }
  }
}
