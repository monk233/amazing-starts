import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { LocalDatabase, openDatabase, TABLES } from '../../src/data/database';

let factory: IDBFactory;
let db: LocalDatabase;
beforeEach(async () => { factory = new IDBFactory(); db = await openDatabase(factory); });
afterEach(() => { db.close(); });
const dimension = (accountId: string, id = 'state', name = '使用状态') => ({ accountId, id, name, description: '', order: 0 });

describe('账号隔离与事务', () => {
  it('creates every planned store without seeding fake account data', async () => {
    for (const table of TABLES) expect(await db.list(table, 'user-a')).toEqual([]);
  });
  it('keeps identical record IDs separate for different accounts', async () => {
    await db.put('dimensions', 'user-a', dimension('user-a'));
    await db.put('dimensions', 'user-b', dimension('user-b', 'state', '部署方式'));
    expect((await db.get('dimensions', 'user-a', 'state'))?.name).toBe('使用状态');
    expect((await db.get('dimensions', 'user-b', 'state'))?.name).toBe('部署方式');
    expect(await db.list('dimensions', 'user-c')).toEqual([]);
  });
  it('rejects uncloneable individual records without leaving a rejected transaction unobserved', async () => {
    const invalid = { ...dimension('user-a'), uncloneable: () => 1 };
    await expect(db.put('dimensions', 'user-a', invalid)).rejects.toThrow();
    expect(await db.list('dimensions', 'user-a')).toEqual([]);
  });
  it('rejects cross-account writes before modifying data', async () => {
    await expect(db.put('dimensions', 'user-a', dimension('user-b'))).rejects.toThrow('跨账号');
    expect(await db.list('dimensions', 'user-b')).toEqual([]);
  });
  it('replaces only the requested account snapshot', async () => {
    await db.put('dimensions', 'user-a', dimension('user-a', 'old'));
    await db.put('dimensions', 'user-b', dimension('user-b'));
    await db.replace('dimensions', 'user-a', [dimension('user-a', 'new')]);
    expect((await db.list('dimensions', 'user-a')).map(item => item.id)).toEqual(['new']);
    expect(await db.list('dimensions', 'user-b')).toHaveLength(1);
  });
  it('rejects duplicate snapshot IDs and preserves the previous snapshot', async () => {
    await db.put('dimensions', 'user-a', dimension('user-a', 'old'));
    await expect(db.replace('dimensions', 'user-a', [dimension('user-a'), dimension('user-a')])).rejects.toThrow('重复');
    expect((await db.list('dimensions', 'user-a'))[0]?.id).toBe('old');
  });
  it('rolls back deletion if one replacement record cannot be cloned', async () => {
    await db.put('dimensions', 'user-a', dimension('user-a', 'old'));
    const invalid = { ...dimension('user-a'), uncloneable: () => 1 };
    await expect(db.replace('dimensions', 'user-a', [invalid])).rejects.toThrow();
    expect((await db.list('dimensions', 'user-a'))[0]?.id).toBe('old');
  });
  it('rejects records from another account in a replacement', async () => {
    await expect(db.replace('dimensions', 'user-a', [dimension('user-b')])).rejects.toThrow('跨账号');
  });
  it('does not reset an unsupported newer database', async () => {
    const existing = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('future-version', 2);
      request.onupgradeneeded = () => request.result.createObjectStore('future-records');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    existing.close();
    await expect(openDatabase(factory, 'future-version')).rejects.toMatchObject({ name: 'VersionError' });
    const reopened = await new Promise<IDBDatabase>(resolve => {
      const request = factory.open('future-version', 2);
      request.onsuccess = () => resolve(request.result);
    });
    expect(reopened.objectStoreNames.contains('future-records')).toBe(true);
    reopened.close();
  });
});
