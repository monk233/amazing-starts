import type { Table, Tables } from './types';

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

export class LocalDatabase {
  constructor(private readonly database: IDBDatabase) {}

  close(): void { this.database.close(); }

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

  // A complete snapshot is replaced in one transaction; incomplete network pages must never call this method.
  async replace<K extends Table>(table: K, accountId: string, records: Tables[K][]): Promise<void> {
    assertKey(accountId);
    const ids = new Set<string>();
    for (const record of records) {
      assertKey(record.id);
      if (record.accountId !== accountId) throw new Error('拒绝跨账号替换。');
      if (ids.has(record.id)) throw new Error('快照包含重复 ID，原数据未被替换。');
      ids.add(record.id);
    }
    const tx = this.database.transaction(table, 'readwrite');
    const done = completion(tx);
    const store = tx.objectStore(table);
    const cursor = store.index('accountId').openCursor(accountId);
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (current) { current.delete(); current.continue(); return; }
      try { for (const record of records) store.put(record); }
      catch { tx.abort(); }
    };
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
