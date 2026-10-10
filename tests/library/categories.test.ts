import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase, type LocalDatabase } from '../../src/data/database';
import type { List, Membership, Repository } from '../../src/data/types';
import { deleteCategory, moveRepository, planCategories, saveCategory } from '../../src/library/categories';

const list = (id: string, patch: Partial<List> = {}): List =>
  ({ accountId: 'a', id, name: id, description: null, isPrivate: false, syncedAt: '', source: 'remote', tracked: true, ...patch });
const link = (listId: string, repositoryId: string, patch: Partial<Membership> = {}): Membership =>
  ({ accountId: 'a', id: listId + ':' + repositoryId, listId, repositoryId, source: 'remote', ...patch });
const repository = (id: string, patch: Partial<Repository> = {}): Repository =>
  ({ accountId: 'a', id, fullName: 'owner/' + id, description: null, language: null, topics: [], visibility: 'public', starredAt: '', pushedAt: null, archived: false, fetchedAt: '', ...patch });

describe('远端 Lists 与本地分类的合并计划', () => {
  it('建立本地没有的远端分类并写入归属', () => {
    const plan = planCategories({ lists: [], memberships: [] }, { lists: [list('L_1')], memberships: [link('L_1', 'R_1')] }, ['R_1']);
    expect(plan.lists.put).toEqual([{ ...list('L_1'), source: 'remote', tracked: true }]);
    expect(plan.lists.remove).toEqual([]);
    expect(plan.memberships.put).toEqual([{ ...link('L_1', 'R_1'), source: 'remote' }]);
    expect(plan.memberships.remove).toEqual([]);
  });
  it('用户改过的分类完全不动，远端改名不会覆盖', () => {
    const edited = list('L_1', { name: '我改的名字', description: '我的说明', tracked: false });
    const plan = planCategories({ lists: [edited], memberships: [link('L_1', 'R_1')] }, { lists: [list('L_1', { name: '远端名字' })], memberships: [] }, ['R_1']);
    expect(plan.lists.put).toEqual([]);
    expect(plan.lists.remove).toEqual([]);
    expect(plan.memberships.put).toEqual([]);
    expect(plan.memberships.remove).toEqual([]);
  });
  it('远端删除的分类连同归属一起移除', () => {
    const plan = planCategories({ lists: [list('L_1')], memberships: [link('L_1', 'R_1')] }, { lists: [], memberships: [] }, ['R_1']);
    expect(plan.lists.remove).toEqual(['L_1']);
    expect(plan.memberships.remove).toEqual(['L_1:R_1']);
  });
  it('手动分类与其归属始终保留', () => {
    const manual = list('local:x', { source: 'manual', tracked: false });
    const plan = planCategories(
      { lists: [manual], memberships: [link('local:x', 'R_1', { source: 'manual' })] },
      { lists: [], memberships: [] }, ['R_1'],
    );
    expect(plan.lists.put).toEqual([]); expect(plan.lists.remove).toEqual([]);
    expect(plan.memberships.remove).toEqual([]);
  });
  it('清理指向已不在快照中的仓库的归属', () => {
    const plan = planCategories(
      { lists: [list('L_1'), list('local:x', { source: 'manual', tracked: false })], memberships: [link('L_1', 'R_gone'), link('local:x', 'R_gone', { source: 'manual' })] },
      { lists: [list('L_1')], memberships: [] }, ['R_1'],
    );
    expect(plan.memberships.remove).toEqual(['L_1:R_gone', 'local:x:R_gone']);
  });
  it('跟随远端的分类按远端结果刷新名称与归属', () => {
    const plan = planCategories(
      { lists: [list('L_1', { name: '旧名字' })], memberships: [link('L_1', 'R_1')] },
      { lists: [list('L_1', { name: '新名字' })], memberships: [link('L_1', 'R_2')] }, ['R_1', 'R_2'],
    );
    expect(plan.lists.put).toEqual([{ ...list('L_1', { name: '新名字' }), source: 'remote', tracked: true }]);
    expect(plan.memberships.put).toEqual([{ ...link('L_1', 'R_2'), source: 'remote' }]);
    expect(plan.memberships.remove).toEqual(['L_1:R_1']);
  });
});

describe('本地分类操作', () => {
  let db: LocalDatabase;
  beforeEach(async () => { db = await openDatabase(new IDBFactory()); });
  afterEach(() => db.close());

  it('创建分类并保存名称与说明', async () => {
    const created = await saveCategory(db, 'a', { id: null, name: '  工具  ', description: '  常用工具  ' });
    expect(created).toMatchObject({ name: '工具', description: '常用工具', source: 'manual', tracked: false, isPrivate: false });
    expect(created.id.startsWith('local:')).toBe(true);
    expect(await db.list('lists', 'a')).toHaveLength(1);
  });
  it('改名与改说明让远端来源分类脱离跟踪', async () => {
    await db.put('lists', 'a', list('L_1', { description: '远端说明' }));
    const updated = await saveCategory(db, 'a', { id: 'L_1', name: '我的名字', description: '' });
    expect(updated).toMatchObject({ id: 'L_1', name: '我的名字', description: null, source: 'remote', tracked: false });
  });
  it('删除分类时连同归属一起删除', async () => {
    await db.put('lists', 'a', list('L_1'));
    await db.put('memberships', 'a', link('L_1', 'R_1'));
    await deleteCategory(db, 'a', 'L_1');
    expect(await db.list('lists', 'a')).toEqual([]);
    expect(await db.list('memberships', 'a')).toEqual([]);
  });
  it('移动项目：离开原分类、进入目标分类，两边都停止跟随远端', async () => {
    await db.put('repositories', 'a', repository('R_1'));
    await db.put('lists', 'a', list('L_1'));
    await db.put('lists', 'a', list('local:new', { source: 'manual', tracked: false }));
    await db.put('memberships', 'a', link('L_1', 'R_1'));
    await moveRepository(db, 'a', 'R_1', 'local:new');
    const memberships = await db.list('memberships', 'a');
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ listId: 'local:new', repositoryId: 'R_1', source: 'manual' });
    expect((await db.get('lists', 'a', 'L_1'))?.tracked).toBe(false);
  });
  it('移出所有分类后项目回到未分类', async () => {
    await db.put('repositories', 'a', repository('R_1'));
    await db.put('lists', 'a', list('L_1'));
    await db.put('memberships', 'a', link('L_1', 'R_1'));
    await moveRepository(db, 'a', 'R_1', null);
    expect(await db.list('memberships', 'a')).toEqual([]);
  });
  it('重复移动到当前分类不改变任何记录', async () => {
    await db.put('repositories', 'a', repository('R_1'));
    await db.put('lists', 'a', list('L_1'));
    await db.put('memberships', 'a', link('L_1', 'R_1'));
    await moveRepository(db, 'a', 'R_1', 'L_1');
    expect((await db.get('lists', 'a', 'L_1'))?.tracked).toBe(true);
    expect(await db.list('memberships', 'a')).toHaveLength(1);
  });
  it('拒绝空名称、超长说明与非法 ID', async () => {
    await expect(saveCategory(db, 'a', { id: null, name: '   ', description: '' })).rejects.toThrow('分类名称');
    await expect(saveCategory(db, 'a', { id: null, name: 'x'.repeat(81), description: '' })).rejects.toThrow('分类名称');
    await expect(saveCategory(db, 'a', { id: null, name: 'ok', description: 'x'.repeat(501) })).rejects.toThrow('说明');
    await expect(saveCategory(db, 'a', { id: '../../escape', name: 'ok', description: '' })).rejects.toThrow('分类 ID');
    expect(await db.list('lists', 'a')).toEqual([]);
  });
  it('拒绝操作不存在的分类或项目', async () => {
    await expect(saveCategory(db, 'a', { id: 'L_missing', name: 'ok', description: '' })).rejects.toThrow('分类不存在');
    await expect(deleteCategory(db, 'a', 'L_missing')).rejects.toThrow('分类不存在');
    await expect(moveRepository(db, 'a', 'R_missing', null)).rejects.toThrow('不在本地收藏中');
    await db.put('repositories', 'a', repository('R_1'));
    await expect(moveRepository(db, 'a', 'R_1', 'L_missing')).rejects.toThrow('目标分类不存在');
  });
  it('分类数据按账号隔离', async () => {
    const created = await saveCategory(db, 'a', { id: null, name: 'A 的分类', description: '' });
    expect(await db.list('lists', 'b')).toEqual([]);
    await expect(saveCategory(db, 'b', { id: created.id, name: 'B', description: '' })).rejects.toThrow('分类不存在');
  });
});
