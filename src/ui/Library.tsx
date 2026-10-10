import type { GitHubController } from './GitHubSettings';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Repository } from '../data/types';
import { filterRepositories, initialFilters, repositoryUrl, type Filters, type Library as LibraryData } from '../library/library';
import { request } from './client';
import { Brand, StarMark } from './Brand';
import { WorkspaceIcon } from './WorkspaceIcon';
import { SelectMenu } from './SelectMenu';
import './library.css';

function formattedDate(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return '暂无记录';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));
}
function ProjectDetail({ repo, data }: { repo: Repository; data: LibraryData }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const tags = data.tags.filter(tag => data.repositoryTags.some(link => link.repositoryId === repo.id && link.tagId === tag.id));
  const lists = data.lists.filter(list => data.memberships.some(link => link.repositoryId === repo.id && link.listId === list.id));
  const url = repositoryUrl(repo.fullName);
  const [owner, name] = repo.fullName.split('/');
  return <section aria-labelledby="project-title" className="project-detail">
    <div className="page-title"><div className="detail-heading"><span className="repo-monogram">{(name || owner || '').slice(0, 2)}</span><div><small>{owner} /</small><h1 id="project-title" ref={heading} tabIndex={-1}>{name || owner}</h1></div></div>{url && <a className="outline-button" href={url} target="_blank" rel="noopener noreferrer"><WorkspaceIcon name="external"/>GitHub</a>}</div>
    <p className="detail-description">{repo.description || '该项目暂无描述。'}</p>
    <div className="view-tabs"><span className="active">项目概览</span><button className="small-link" onClick={close}>返回收藏</button></div>
    <div className="detail-columns"><article className="article"><h2>项目信息</h2>
      <dl className="project-facts"><div><dt>主要语言</dt><dd>{repo.language || '未标注'}</dd></div><div><dt>可见性</dt><dd>{repo.visibility === 'private' ? '私有' : '公开'}</dd></div><div><dt>项目状态</dt><dd>{repo.archived ? '已归档' : '未归档'}</dd></div><div><dt>收藏时间</dt><dd>{formattedDate(repo.starredAt)}</dd></div><div><dt>最近推送</dt><dd>{formattedDate(repo.pushedAt)}</dd></div><div><dt>本地快照</dt><dd>{formattedDate(repo.fetchedAt)}</dd></div></dl>
      <h2>GitHub Topics</h2><div className="tags">{repo.topics.length ? repo.topics.map(topic => <span className="tag" key={topic}>{topic}</span>) : <span className="note">暂无 Topics。</span>}</div>
      <p className="source-note">以上信息来自本地快照，可能与 GitHub 当前状态不同。</p>
    </article><aside className="side-note"><h2>它在我的收藏里</h2><div className="dimension"><h3>GitHub 分类</h3><div className="tags">{lists.length ? lists.map(list => <span className="tag" key={list.id}>{list.name}{list.isPrivate ? ' · 私有' : ''}</span>) : <span className="note">尚未归入 List。</span>}</div></div>
      {data.dimensions.map(dimension => { const assigned = tags.filter(tag => tag.dimensionId === dimension.id); return assigned.length ? <div className="dimension" key={dimension.id}><h3>{dimension.name} · 本地</h3><div className="tags">{assigned.map(tag => <span className="tag" key={tag.id} title={data.repositoryTags.find(link => link.repositoryId === repo.id && link.tagId === tag.id)?.source === 'ai' ? 'AI 分类' : '手动标记'}>{tag.name}</span>)}</div></div> : null; })}
      {!tags.length && <p>尚未添加本地标签。</p>}<div className="local-label"><WorkspaceIcon name="lock"/>维度与标签仅保存在本地</div>
    </aside></div>
  </section>;
}

export function Library({ route, children, notice, github }: { github: GitHubController; route: string; children: ReactNode; notice: ReactNode }) {
  const [data, setData] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Repository | null>(null);
  const main = useRef<HTMLElement>(null);
  const resultsPane = useRef<HTMLDivElement>(null);
  const filterPanel = useRef<HTMLDetailsElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const savedScroll = useRef(0);
  const fitFilterPanel = () => {
    const panel = filterPanel.current;
    const summary = panel?.querySelector('summary');
    if (panel?.open && summary) panel.style.setProperty('--filter-space', Math.max(100, window.innerHeight - summary.getBoundingClientRect().bottom - 24) + 'px');
  };
  useEffect(() => { if (resultsPane.current) resultsPane.current.scrollTop = savedScroll.current; }, [route, selected?.id]);
  useEffect(() => { resultsPane.current?.scrollTo({ top: 0 }); }, [page, filters]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (filterPanel.current && !filterPanel.current.contains(event.target as Node)) filterPanel.current.open = false;
    };
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && searchInput.current) {
        event.preventDefault(); searchInput.current.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', shortcut);
    window.addEventListener('resize', fitFilterPanel);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', shortcut); window.removeEventListener('resize', fitFilterPanel); };
  }, []);
  useEffect(() => { if (main.current) main.current.scrollTop = 0; }, [route, selected?.id]);
  const generation = useRef(0);
  const account = useRef<string | null>(null);
  async function load(accountId: string | null) {
    const current = ++generation.current;
    account.current = accountId;
    savedScroll.current = 0;
    setLoading(true); setError(''); setData(null); setSelected(null);
    setFilters(initialFilters); setPage(1);
    try {
      const reply = await request({ type: 'LIBRARY_READ', accountId });
      if (!reply.ok || !('kind' in reply.value) || reply.value.kind !== 'library') throw new Error('收藏数据格式不正确，请重试。');
      if (generation.current === current) { setData(reply.value); account.current = reply.value.accountId; }
    } catch (reason: unknown) {
      if (generation.current === current) setError(reason instanceof Error ? reason.message : '收藏读取失败，请重试。');
    } finally { if (generation.current === current) setLoading(false); }
  }
  useEffect(() => { void load(account.current); return () => { generation.current++; }; }, [github.refreshKey]);
  const results = useMemo(() => data ? filterRepositories(data, filters) : [], [data, filters]);
  const languages = [...new Set(data?.repositories.flatMap(repo => repo.language ? [repo.language] : []) ?? [])].sort();
  const change = (patch: Partial<Filters>) => { setFilters(previous => ({ ...previous, ...patch })); setPage(1); };
  const reset = () => { setFilters(initialFilters); setPage(1); };
  const hasFilters = filters.query.trim() || filters.listId || filters.language || filters.visibility || filters.archived || filters.tagIds.length;
  const pages = Math.max(1, Math.ceil(results.length / 40));
  const goLibrary = (listId = filters.listId) => { setSelected(null); change({ listId }); location.hash = 'library'; };
  const closeDetail = () => { const id = selected?.id; setSelected(null); requestAnimationFrame(() => { if (id) document.getElementById('repository-' + id)?.focus(); }); };
  const openDetail = (repo: Repository) => { savedScroll.current = resultsPane.current?.scrollTop ?? 0; setSelected(repo); };
  const isDetail = route !== 'settings' && !!selected;
  const activeAccount = data?.accounts.find(item => item.accountId === data.accountId);
  const connection = github.state?.accounts.find(item => item.account.accountId === data?.accountId);
  const categoryName = filters.listId === '__unlisted' ? '未分类' : data?.lists.find(list => list.id === filters.listId)?.name ?? '所有收藏';
  const listOptions = [{ value: '', label: '所有收藏' }, ...(data?.lists.map(list => ({ value: list.id, label: list.name })) ?? []), { value: '__unlisted', label: '未分类' }];
  const extraCount = [filters.language, filters.visibility, filters.archived].filter(Boolean).length + filters.tagIds.length;
  const listCounts = new Map<string, Set<string>>();
  const listed = new Set<string>();
  data?.memberships.forEach(link => {
    const entries = listCounts.get(link.listId) ?? new Set<string>();
    entries.add(link.repositoryId); listCounts.set(link.listId, entries); listed.add(link.repositoryId);
  });
  const unlistedCount = data?.repositories.filter(repo => !listed.has(repo.id)).length ?? 0;
  const syncRunning = connection?.sync?.state === 'running';
  const syncLabel = syncRunning ? '同步中…' : connection?.connected ? '同步收藏' : '连接 GitHub';
  return <div className="manager-stage"><div className="manager-workspace">
    <aside className="rail" aria-label="工作区导航">
      <a href="#library" className="brand-link" onClick={() => goLibrary('')}><Brand/></a>
      <span className="brand-caption">你的开源收藏馆</span>
      <nav className="primary-nav" aria-label="主导航">
        <a href="#library" onClick={() => goLibrary('')} aria-current={route === 'library' && !selected && !filters.listId ? 'page' : undefined}>
          <WorkspaceIcon name="collection"/>所有收藏<span className="nav-count">{data?.repositories.length ?? '—'}</span>
        </a>
      </nav>
      <div className="rail-section">
        <div className="rail-heading"><h2>GitHub Lists</h2><span>{data?.lists.length ?? 0}</span></div>
        <div className="rail-list" aria-label="分类列表">
          {data?.lists.map(list => <button type="button" aria-pressed={filters.listId === list.id} key={list.id} onClick={() => goLibrary(list.id)}>
            <WorkspaceIcon name="folder"/><span className="category-name" title={list.name}>{list.name}</span><span className="nav-count">{listCounts.get(list.id)?.size ?? 0}</span>
          </button>)}
          {!data?.lists.length && <p className="rail-empty">同步后显示你的 Lists</p>}
        </div>
        <button type="button" className="unlisted-link" aria-pressed={filters.listId === '__unlisted'} onClick={() => goLibrary('__unlisted')}>
          <WorkspaceIcon name="repository"/><span>未分类</span><span className="nav-count">{unlistedCount}</span>
        </button>
      </div>
      <div className="rail-footer">
        <a className="settings-link" href="#settings" aria-current={route === 'settings' ? 'page' : undefined}><WorkspaceIcon name="settings"/>设置与偏好<WorkspaceIcon name="arrow"/></a>
        <div className="local-account"><span className="avatar" aria-hidden="true">{activeAccount?.login.slice(0, 1).toUpperCase() || 'A'}</span><div>
          {data?.accounts.length ? <SelectMenu label="本地账号" value={data.accountId ?? ''} options={data.accounts.map(item => ({ value: item.accountId, label: item.login }))} onChange={value => void load(value)}/> : <strong>本地工作区</strong>}
          <small><i className={connection?.connected ? 'connection-dot connected' : 'connection-dot'}/>{activeAccount ? connection?.connected ? 'GitHub 已连接' : '本地快照' : '尚未连接 GitHub'}</small>
        </div></div>
      </div>
    </aside>
    <main ref={main} className={'workspace-main' + (route === 'settings' || isDetail ? ' document-view' : '')}>
      {notice}
      {route === 'settings' ? <div className="document-content"><div className="page-title"><div><span className="eyebrow">工作区</span><h1>设置与偏好</h1><p>管理外观、GitHub 连接与 AI 服务。</p></div><a className="outline-button" href="#library">返回收藏<WorkspaceIcon name="arrow"/></a></div><div className="workspace-settings">{children}</div></div>
      : isDetail && selected && data ? <div className="document-content"><button className="back-link" onClick={closeDetail}><span aria-hidden="true">←</span> 返回收藏</button><ProjectDetail repo={selected} data={data}/></div>
      : <section className="library" aria-labelledby="library-title">
        <header className="library-header">
          <div className="library-heading"><span className="eyebrow">我的收藏馆</span><div className="title-line"><h1 id="library-title">{categoryName}</h1><span className="collection-count">{data ? results.length : '—'}</span></div>
            <p className="sync-caption" role="status">{syncRunning ? '正在同步，当前展示上次快照' : activeAccount?.lastSyncedAt ? '上次同步 ' + formattedDate(activeAccount.lastSyncedAt) : '从 GitHub 同步你的开源收藏'}</p>
          </div>
          <button className="button sync-button" disabled={loading || github.busy || syncRunning} onClick={() => {
            if (connection?.connected) void github.send({ type: 'GITHUB_SYNC', accountId: connection.account.accountId }); else location.hash = 'settings';
          }}><WorkspaceIcon name="refresh"/>{syncLabel}</button>
        </header>
        <div className="library-controls">
          <label className="search"><WorkspaceIcon name="search"/><input ref={searchInput} aria-label="搜索收藏" type="search" placeholder="搜索项目、描述或标签…" value={filters.query} disabled={!data?.repositories.length} onChange={event => change({ query: event.target.value })}/><kbd>Ctrl K</kbd></label>
          <div className="mobile-category"><SelectMenu label="分类" value={filters.listId} options={listOptions} onChange={value => change({ listId: value })}/></div>
          <details className="advanced-filters" ref={filterPanel} onToggle={fitFilterPanel} onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
          }}>
            <summary><WorkspaceIcon name="filter"/>筛选{extraCount > 0 && <span className="filter-count">{extraCount}</span>}</summary>
            <div className="filter-panel">
              <div className="filter-panel-heading"><h2>筛选收藏</h2><button className="icon-button" aria-label="关闭筛选" onClick={() => { if (filterPanel.current) { filterPanel.current.open = false; filterPanel.current.querySelector('summary')?.focus(); } }}><WorkspaceIcon name="close"/></button></div>
              <fieldset disabled={loading || !data?.repositories.length} className="filter-fields"><legend className="visually-hidden">项目条件</legend>
                <div><span>主要语言</span><SelectMenu label="主要语言" value={filters.language} disabled={loading || !data?.repositories.length} options={[{ value: '', label: '全部语言' }, ...languages.map(language => ({ value: language, label: language })), { value: '__none', label: '未标注语言' }]} onChange={value => change({ language: value })}/></div>
                <div><span>可见性</span><SelectMenu label="可见性" value={filters.visibility} disabled={loading || !data?.repositories.length} options={[{ value: '', label: '公开与私有' }, { value: 'public', label: '公开' }, { value: 'private', label: '私有' }]} onChange={value => change({ visibility: value })}/></div>
                <div><span>项目状态</span><SelectMenu label="项目状态" value={filters.archived} disabled={loading || !data?.repositories.length} options={[{ value: '', label: '全部状态' }, { value: 'false', label: '未归档' }, { value: 'true', label: '已归档' }]} onChange={value => change({ archived: value })}/></div>
              </fieldset>
              <div className="tag-filters" aria-label="多维标签筛选">
                {data?.dimensions.map(dimension => <fieldset className="dimension" key={dimension.id} disabled={loading || !data.repositories.length}><legend>{dimension.name}</legend><div className="tags">
                  {data.tags.filter(tag => tag.dimensionId === dimension.id).map(tag => <button className="tag tag-filter" key={tag.id} aria-pressed={filters.tagIds.includes(tag.id)} onClick={() => change({ tagIds: filters.tagIds.includes(tag.id) ? filters.tagIds.filter(id => id !== tag.id) : [...filters.tagIds, tag.id] })}>{filters.tagIds.includes(tag.id) && <WorkspaceIcon name="check"/>}{tag.name}</button>)}
                </div>{!data.tags.some(tag => tag.dimensionId === dimension.id) && <p className="note">暂无标签</p>}</fieldset>)}
                {!!data?.dimensions.length && <p className="note">同一维度满足任一标签，不同维度同时满足。</p>}
              </div>
              <div className="filter-panel-footer"><span>条件即时生效</span><button className="small-link" disabled={!extraCount} onClick={() => change({ language: '', visibility: '', archived: '', tagIds: [] })}>重置条件</button></div>
            </div>
          </details>
          <div className="library-sort"><SelectMenu label="排序" value={filters.sort} disabled={!data?.repositories.length} options={[{ value: 'starred', label: '最近收藏' }, { value: 'updated', label: '最近推送' }, { value: 'name', label: '项目名称' }]} onChange={value => change({ sort: value as Filters['sort'] })}/></div>
        </div>
        {!!hasFilters && <div className="active-filters" aria-label="已选条件">
          {filters.query.trim() && <button className="filter-chip" onClick={() => change({ query: '' })} aria-label="移除关键词">“{filters.query.trim()}”<WorkspaceIcon name="close"/></button>}
          {filters.listId && <button className="filter-chip" onClick={() => change({ listId: '' })} aria-label="移除分类">{categoryName}<WorkspaceIcon name="close"/></button>}
          {filters.language && <button className="filter-chip" onClick={() => change({ language: '' })} aria-label="移除语言">{filters.language === '__none' ? '未标注语言' : filters.language}<WorkspaceIcon name="close"/></button>}
          {filters.visibility && <button className="filter-chip" onClick={() => change({ visibility: '' })} aria-label="移除可见性">{filters.visibility === 'private' ? '私有' : '公开'}<WorkspaceIcon name="close"/></button>}
          {filters.archived && <button className="filter-chip" onClick={() => change({ archived: '' })} aria-label="移除项目状态">{filters.archived === 'true' ? '已归档' : '未归档'}<WorkspaceIcon name="close"/></button>}
          {filters.tagIds.map(id => <button className="filter-chip" key={id} onClick={() => change({ tagIds: filters.tagIds.filter(tag => tag !== id) })} aria-label={'移除标签 ' + data?.tags.find(tag => tag.id === id)?.name}>{data?.tags.find(tag => tag.id === id)?.name}<WorkspaceIcon name="close"/></button>)}
          <button className="small-link" onClick={reset}>清除全部</button>
        </div>}
        {(github.error || connection?.sync?.error) && <p role="alert" className="error">{github.error || connection?.sync?.error} <a href="#settings">查看 GitHub 设置</a></p>}
        {error && <div role="alert" className="error">{error} <button className="outline-button" onClick={() => void load(null)}>重新读取账号</button></div>}
        <div className="results-heading"><span>项目</span><span role="status">{loading ? '正在读取本地收藏…' : data ? results.length + ' 个结果' : '收藏尚未加载'}</span></div>
        <div className="library-results" ref={resultsPane} aria-busy={loading}>
          {loading && <div className="loading-results" role="status"><WorkspaceIcon name="collection"/><p>正在读取你的收藏…</p></div>}
          {!loading && data && (!data.repositories.length ? <div className="empty-results"><StarMark size={44}/><span className="eyebrow">从一颗 Star 开始</span><h2>{data.accountId ? '还没有同步的收藏' : '把好项目，放在一起。'}</h2><p>连接 GitHub，收藏、分类和项目详情就会出现在这里。</p><button className="button" disabled={github.busy || syncRunning} onClick={() => { if (connection?.connected) void github.send({ type: 'GITHUB_SYNC', accountId: connection.account.accountId }); else location.hash = 'settings'; }}>{syncLabel}<WorkspaceIcon name="arrow"/></button></div>
          : !results.length ? <div className="empty-results"><WorkspaceIcon name="search"/><h2>没有匹配的收藏</h2><p>换个关键词，或减少筛选条件。</p><button className="outline-button" onClick={reset}>清除全部筛选</button></div>
          : <div className="repo-list">{results.slice((page - 1) * 40, page * 40).map(repo => {
            const [owner, name] = repo.fullName.split('/');
            const memberships = data.lists.filter(list => data.memberships.some(link => link.repositoryId === repo.id && link.listId === list.id));
            const tags = data.tags.filter(tag => data.repositoryTags.some(link => link.repositoryId === repo.id && link.tagId === tag.id));
            return <button id={'repository-' + repo.id} className="repo-row" key={repo.id} onClick={() => openDetail(repo)} aria-label={'查看项目详情：' + repo.fullName}>
              <span className="repo-monogram" aria-hidden="true">{(name || owner || '').slice(0, 2)}</span>
              <span className="repo-copy"><span className="repo-owner">{owner}</span><span className="repo-name">{name || owner}</span><span className="repo-description">{repo.description || '该项目暂无描述。'}</span>
                <span className="repo-meta"><span className="repo-language"><i className="language-dot"/>{repo.language || '未标注语言'}</span>{memberships.slice(0, 2).map(list => <span className="meta-tag" key={list.id}>{list.name}</span>)}{tags.slice(0, 2).map(tag => <span className="meta-tag" key={tag.id}>{tag.name}</span>)}{repo.visibility === 'private' && <span>私有</span>}{repo.archived && <span>已归档</span>}</span>
              </span><span className="repo-trailing"><WorkspaceIcon name="arrow"/><span>{filters.sort === 'updated' ? '推送于' : '收藏于'}<time>{formattedDate(filters.sort === 'updated' ? repo.pushedAt : repo.starredAt)}</time></span></span>
            </button>;
          })}</div>)}
        </div>
        <footer className="library-footer"><span><WorkspaceIcon name="lock"/>本地收藏快照</span>{pages > 1 ? <nav className="library-pagination" aria-label="收藏分页"><button className="icon-button" aria-label="上一页" disabled={page === 1} onClick={() => setPage(value => value - 1)}><span aria-hidden="true">←</span></button><span role="status">{page} / {pages}</span><button className="icon-button" aria-label="下一页" disabled={page === pages} onClick={() => setPage(value => value + 1)}><span aria-hidden="true">→</span></button></nav> : <span>{data?.repositories.length ?? 0} 个收藏</span>}</footer>
      </section>}
    </main>
  </div></div>;
}
