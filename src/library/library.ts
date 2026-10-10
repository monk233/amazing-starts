import type { LocalDatabase } from '../data/database';
import type { Account, Repository, List, Membership, Dimension, Tag, RepositoryTag } from '../data/types';

export interface Library {
  kind: 'library'; accounts: Account[]; accountId: string | null;
  repositories: Repository[]; lists: List[]; memberships: Membership[];
  dimensions: Dimension[]; tags: Tag[]; repositoryTags: RepositoryTag[];
}
export async function readLibrary(db: LocalDatabase, requestedAccount: string | null): Promise<Library> {
  const accounts = (await db.accounts()).sort((a, b) => a.login.localeCompare(b.login));
  const accountId = requestedAccount ?? accounts[0]?.accountId ?? null;
  if (accountId && !accounts.some(account => account.accountId === accountId)) throw new Error('本地账号不存在，请刷新收藏。');
  const empty: Library = { kind: 'library', accounts, accountId, repositories: [], lists: [], memberships: [], dimensions: [], tags: [], repositoryTags: [] };
  if (!accountId) return empty;
  const [repositories, lists, memberships, dimensions, tags, repositoryTags] = await Promise.all([
    db.list('repositories', accountId), db.list('lists', accountId), db.list('memberships', accountId),
    db.list('dimensions', accountId), db.list('tags', accountId), db.list('repositoryTags', accountId),
  ]);
  return { ...empty, repositories, lists: lists.sort((a, b) => a.name.localeCompare(b.name)), memberships, dimensions: dimensions.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)), tags, repositoryTags };
}
export interface Filters {
  query: string; listId: string; language: string; visibility: string; archived: string;
  tagIds: string[]; sort: 'starred' | 'updated' | 'name';
}
export const initialFilters: Filters = { query: '', listId: '', language: '', visibility: '', archived: '', tagIds: [], sort: 'starred' };
export function filterRepositories(data: Library, filters: Filters): Repository[] {
  const tagsByRepository = new Map<string, Set<string>>();
  for (const link of data.repositoryTags) {
    const tags = tagsByRepository.get(link.repositoryId) ?? new Set<string>();
    tags.add(link.tagId); tagsByRepository.set(link.repositoryId, tags);
  }
  const groups = new Map<string, string[]>();
  for (const id of filters.tagIds) {
    const dimension = data.tags.find(tag => tag.id === id)?.dimensionId ?? id;
    groups.set(dimension, [...(groups.get(dimension) ?? []), id]);
  }
  const listed = new Set(data.memberships.filter(link => filters.listId === '__unlisted' || link.listId === filters.listId).map(link => link.repositoryId));
  const terms = filters.query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  const tagNames = new Map(data.tags.map(tag => [tag.id, tag.name]));
  const date = (value: string | null) => value ? Date.parse(value) || 0 : 0;
  return data.repositories.filter(repo => {
    if (filters.listId && (filters.listId === '__unlisted' ? listed.has(repo.id) : !listed.has(repo.id))) return false;
    if (filters.language && (repo.language ?? '__none') !== filters.language) return false;
    if (filters.visibility && repo.visibility !== filters.visibility) return false;
    if (filters.archived && String(repo.archived) !== filters.archived) return false;
    const repoTags = tagsByRepository.get(repo.id) ?? new Set<string>();
    if ([...groups.values()].some(ids => !ids.some(id => repoTags.has(id)))) return false;
    const text = [repo.fullName, repo.description ?? '', repo.language ?? '', ...repo.topics, ...[...repoTags].map(id => tagNames.get(id) ?? '')].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  }).sort((a, b) => {
    const difference = filters.sort === 'name' ? 0 : filters.sort === 'updated' ? date(b.pushedAt) - date(a.pushedAt) : date(b.starredAt) - date(a.starredAt);
    return difference || a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id);
  });
}
export function repositoryUrl(fullName: string): string | null {
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(fullName) && !['.', '..'].includes(fullName.split('/')[1]!)
    ? 'https://github.com/' + fullName : null;
}
