import { planCategories } from '../library/categories';
import type { Account, Job, List, Membership, Snapshot, SyncMode, Table, Tables } from './types';

export const DATABASE_NAME = 'amazing-starts';
export const DATABASE_VERSION = 1;
export const TABLES: Table[] = [
  'accounts', 'repositories', 'lists', 'memberships', 'dimensions', 'tags',
  'repositoryTags', 'manualOverrides', 'handbooks', 'comparisons', 'jobs', 'activities',
];

function completion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('本地事务已中止，原数据未被替换。'));
    transaction.onerror = () => reject(transaction.error ?? new Error('本地事务失败。'));
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地数据读取失败。'));
  });
}

function assertKey(value: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) {
    throw new Error('账号和记录必须使用有效的稳定 ID。');
  }
}

function assertScoped(accountId: string, records: { id: string; accountId: string }[]): void {
  const ids = new Set<string>();
  for (const record of records) {
    assertKey(record.id);
    if (record.accountId !== accountId) throw new Error('拒绝跨账号写入。');
    if (ids.has(record.id)) throw new Error('快照包含重复 ID，原数据未被替换。');
    ids.add(record.id);
  }
}

// Cursor chains keep every request inside one transaction; awaiting between writes would commit it early.
function replaceStore(store: IDBObjectStore, accountId: string, records: unknown[], abort: () => void): void {
  const cursor = store.index('accountId').openCursor(accountId);
  cursor.onsuccess = () => {
    const current = cursor.result;
    if (current) { current.delete(); current.continue(); return; }
    try { for (const record of records) store.put(record); }
    catch { abort(); }
  };
  cursor.onerror = () => abort();
}

function patchStore<T extends { id: string }>(store: IDBObjectStore, accountId: string, put: T[], remove: string[], abort: () => void): void {
  const removing = new Set(remove);
  const cursor = store.index('accountId').openCursor(accountId);
  cursor.onsuccess = () => {
    const current = cursor.result;
    if (current) {
      if (removing.has(String(current.value.id))) current.delete();
      current.continue();
      return;
    }
    try { for (const record of put) store.put(record); }
    catch { abort(); }
  };
  cursor.onerror = () => abort();
}

export interface LibraryChanges {
  lists?: { put: List[]; remove: string[] };
  memberships?: { put: Membership[]; remove: string[] };
}

export class LocalDatabase {
  constructor(private readonly database: IDBDatabase) {}

  close(): void { this.database.close(); }

  async accounts(): Promise<Account[]> {
    const tx = this.database.transaction('accounts', 'readonly');
    const [accounts] = await Promise.all([
      result(tx.objectStore('accounts').getAll() as IDBRequest<Account[]>), completion(tx),
    ]);
    return accounts;
  }

  async put<K extends Table>(table: K, accountId: string, record: Tables[K]): Promise<void> {
    assertKey(accountId); assertKey(record.id);
    if (record.accountId !== accountId) throw new Error('拒绝跨账号写入。');
    const tx = this.database.transaction(table, 'readwrite');
    const done = completion(tx);
    try { tx.objectStore(table).put(record); }
    catch (error: unknown) {
      tx.abort();
      await done.catch(() => undefined);
      throw error;
    }
    await done;
  }

  async get<K extends Table>(table: K, accountId: string, id: string): Promise<Tables[K] | undefined> {
    assertKey(accountId); assertKey(id);
    const tx = this.database.transaction(table, 'readonly');
    const done = completion(tx);
    const [record] = await Promise.all([
      result(tx.objectStore(table).get([accountId, id]) as IDBRequest<Tables[K] | undefined>), done,
    ]);
    return record;
  }

  async list<K extends Table>(table: K, accountId: string): Promise<Tables[K][]> {
    assertKey(accountId);
    const tx = this.database.transaction(table, 'readonly');
    const done = completion(tx);
    const [records] = await Promise.all([
      result(tx.objectStore(table).index('accountId').getAll(accountId) as IDBRequest<Tables[K][]>), done,
    ]);
    return records;
  }

  /** 分类的创建、改名、删除与归属移动：一次事务提交，失败时保持原样。 */
  async commitLibrary(accountId: string, changes: LibraryChanges): Promise<void> {
    assertKey(accountId);
    const lists = changes.lists ?? { put: [], remove: [] };
    const memberships = changes.memberships ?? { put: [], remove: [] };
    assertScoped(accountId, lists.put);
    assertScoped(accountId, memberships.put);
    const tx = this.database.transaction(['lists', 'memberships'], 'readwrite');
    const done = completion(tx);
    try {
      patchStore(tx.objectStore('lists'), accountId, lists.put, lists.remove, () => tx.abort());
      patchStore(tx.objectStore('memberships'), accountId, memberships.put, memberships.remove, () => tx.abort());
    } catch (error: unknown) {
      tx.abort(); await done.catch(() => undefined); throw error;
    }
    await done;
  }

  /**
   * 提交一次完整同步。
   * 规则 stars+lists 时按远端 Lists 增量维护分类：跟随远端的分类被更新或删除，
   * 用户改过的分类、手动分类及其归属原样保留。
   */
  async commitSyncSnapshot(account: Account, job: Job, snapshot: Snapshot, mode: SyncMode): Promise<void> {
    const accountId = account.accountId;
    assertKey(accountId);
    assertScoped(accountId, snapshot.repositories);
    assertScoped(accountId, snapshot.lists);
    assertScoped(accountId, snapshot.memberships);
    const repositories = new Set(snapshot.repositories.map(item => item.id));
    const lists = new Set(snapshot.lists.map(item => item.id));
    if (snapshot.memberships.some(item => !repositories.has(item.repositoryId) || !lists.has(item.listId))) throw new Error('快照包含无效归属，原数据未被替换。');
    const trackCategories = mode === 'stars+lists';
    const plan = trackCategories
      ? planCategories(
        { lists: await this.list('lists', accountId), memberships: await this.list('memberships', accountId) },
        snapshot,
        snapshot.repositories.map(repo => repo.id),
      )
      : { lists: { put: [], remove: [] as string[] }, memberships: { put: [], remove: [] as string[] } };
    const tx = this.database.transaction(
      trackCategories ? ['accounts', 'jobs', 'repositories', 'lists', 'memberships'] : ['accounts', 'jobs', 'repositories'],
      'readwrite',
    );
    const done = completion(tx);
    try {
      tx.objectStore('accounts').put(account);
      tx.objectStore('jobs').put(job);
      replaceStore(tx.objectStore('repositories'), accountId, snapshot.repositories, () => tx.abort());
      if (trackCategories) {
        patchStore(tx.objectStore('lists'), accountId, plan.lists.put, plan.lists.remove, () => tx.abort());
        patchStore(tx.objectStore('memberships'), accountId, plan.memberships.put, plan.memberships.remove, () => tx.abort());
      }
    } catch (error: unknown) {
      tx.abort(); await done.catch(() => undefined); throw error;
    }
    await done;
  }

  // A complete snapshot is replaced in one transaction; incomplete network pages must never call this method.
  async replace<K extends Table>(table: K, accountId: string, records: Tables[K][]): Promise<void> {
    assertKey(accountId);
    assertScoped(accountId, records);
    const tx = this.database.transaction(table, 'readwrite');
    const done = completion(tx);
    replaceStore(tx.objectStore(table), accountId, records, () => tx.abort());
    await done;
  }
}

export function openDatabase(factory: IDBFactory = globalThis.indexedDB, name = DATABASE_NAME): Promise<LocalDatabase> {
  return new Promise((resolve, reject) => {
    let failed = false;
    const request = factory.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const table of TABLES) {
        const store = db.createObjectStore(table, { keyPath: ['accountId', 'id'] });
        store.createIndex('accountId', 'accountId', { unique: false });
      }
    };
    request.onerror = () => { failed = true; reject(request.error ?? new Error('无法打开本地数据库。')); };
    request.onblocked = () => { failed = true; reject(new Error('数据库升级被其他页面阻塞，请关闭旧的扩展页面后重试。')); };
    request.onsuccess = () => {
      const db = request.result;
      if (failed) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(new LocalDatabase(db));
    };
  });
}
