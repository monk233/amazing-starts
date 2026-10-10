import type { LocalDatabase } from '../data/database';
import type { List, Membership } from '../data/types';
import { listSource, listTracked, membershipSource } from '../data/types';

export const CATEGORY_PREFIX = 'local:';
export const MAX_CATEGORY_NAME = 80;
export const MAX_CATEGORY_DESCRIPTION = 500;
const RECORD_ID = /^[A-Za-z0-9_=:.-]{1,180}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export const newCategoryId = (): string => CATEGORY_PREFIX + crypto.randomUUID();

export function assertRecordId(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || !RECORD_ID.test(raw)) throw new Error(`${label}无效。`);
  return raw;
}

export function categoryName(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('分类名称无效。');
  const name = raw.trim();
  if (!name || name.length > MAX_CATEGORY_NAME || CONTROL.test(name)) {
    throw new Error(`分类名称需要 1–${MAX_CATEGORY_NAME} 个字符，且不含控制字符。`);
  }
  return name;
}

export function categoryDescription(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('分类说明无效。');
  const description = raw.trim();
  if (description.length > MAX_CATEGORY_DESCRIPTION || CONTROL.test(description)) {
    throw new Error(`分类说明不能超过 ${MAX_CATEGORY_DESCRIPTION} 个字符。`);
  }
  return description;
}

export interface CategoryPlan {
  lists: { put: List[]; remove: string[] };
  memberships: { put: Membership[]; remove: string[] };
}

/**
 * 把远端 Lists 合并进本地分类。
 * 跟随远端（tracked）的分类按远端结果更新或删除；用户改过的分类与手动分类完全不动。
 * 指向已不在快照中的仓库的归属会被清理，避免留下悬空记录。
 */
export function planCategories(
  existing: { lists: List[]; memberships: Membership[] },
  incoming: { lists: List[]; memberships: Membership[] },
  repositoryIds: string[],
): CategoryPlan {
  const local = new Map(existing.lists.map(list => [list.id, list]));
  const remoteIds = new Set(incoming.lists.map(list => list.id));
  const available = new Set(repositoryIds);
  const accepted = new Set<string>();
  const lists: List[] = [];
  const removedListIds: string[] = [];
  for (const remote of incoming.lists) {
    const current = local.get(remote.id);
    if (current && (listSource(current) === 'manual' || !listTracked(current))) continue;
    lists.push({ ...remote, source: 'remote', tracked: true });
    accepted.add(remote.id);
  }
  for (const current of existing.lists) {
    if (remoteIds.has(current.id) || listSource(current) === 'manual') continue;
    if (listTracked(current)) removedListIds.push(current.id);
  }
  const removed = new Set(removedListIds);
  const removedMembershipIds: string[] = [];
  for (const link of existing.memberships) {
    const replaced = membershipSource(link) !== 'manual' && (removed.has(link.listId) || !local.has(link.listId) || accepted.has(link.listId));
    if (replaced || !available.has(link.repositoryId)) removedMembershipIds.push(link.id);
  }
  return {
    lists: { put: lists, remove: removedListIds },
    memberships: { remove: removedMembershipIds, put: incoming.memberships.filter(link => accepted.has(link.listId)).map(link => ({ ...link, source: 'remote' as const })) },
  };
}

/** 创建或更新一个分类。远端来源的分类一旦被本地修改，就不再跟随远端同步。 */
export async function saveCategory(db: LocalDatabase, accountId: string, input: { id: string | null; name: unknown; description: unknown }): Promise<List> {
  const name = categoryName(input.name);
  const description = categoryDescription(input.description);
  const id = input.id === null ? null : assertRecordId(input.id, '分类 ID');
  const existing = id === null ? undefined : await db.get('lists', accountId, id);
  if (id !== null && !existing) throw new Error('分类不存在，请刷新后重试。');
  const category: List = existing
    ? { ...existing, name, description: description || null, tracked: false }
    : { accountId, id: newCategoryId(), name, description: description || null, isPrivate: false, syncedAt: new Date().toISOString(), source: 'manual', tracked: false };
  await db.commitLibrary(accountId, { lists: { put: [category], remove: [] } });
  return category;
}

/** 删除分类及其归属；其中的 star 回到未分类。 */
export async function deleteCategory(db: LocalDatabase, accountId: string, id: string): Promise<void> {
  const categoryId = assertRecordId(id, '分类 ID');
  if (!await db.get('lists', accountId, categoryId)) throw new Error('分类不存在，请刷新后重试。');
  const links = await db.list('memberships', accountId);
  await db.commitLibrary(accountId, {
    lists: { put: [], remove: [categoryId] },
    memberships: { put: [], remove: links.filter(link => link.listId === categoryId).map(link => link.id) },
  });
}

/** 把 star 移到目标分类（移动语义：先离开原有分类）；目标为空表示移出所有分类。 */
export async function moveRepository(db: LocalDatabase, accountId: string, repositoryId: string, target: string | null): Promise<void> {
  const id = assertRecordId(repositoryId, '项目 ID');
  const categoryId = target === null ? null : assertRecordId(target, '分类 ID');
  if (!await db.get('repositories', accountId, id)) throw new Error('项目不在本地收藏中，请先同步。');
  if (categoryId && !await db.get('lists', accountId, categoryId)) throw new Error('目标分类不存在，请刷新后重试。');
  const links = (await db.list('memberships', accountId)).filter(link => link.repositoryId === id);
  if (categoryId === null && !links.length) return;
  if (links.length === 1 && links[0]?.listId === categoryId) return;
  const lists = await db.list('lists', accountId);
  const touched = [...new Set([...links.map(link => link.listId), ...(categoryId ? [categoryId] : [])])]
    .map(listId => lists.find(list => list.id === listId))
    .filter((list): list is List => !!list && listSource(list) === 'remote' && listTracked(list))
    .map(list => ({ ...list, tracked: false }));
  const moved: Membership | null = categoryId === null ? null : { accountId, id: categoryId + ':' + id, repositoryId: id, listId: categoryId, source: 'manual' };
  await db.commitLibrary(accountId, {
    lists: { put: touched, remove: [] },
    memberships: { put: moved ? [moved] : [], remove: links.map(link => link.id) },
  });
}
