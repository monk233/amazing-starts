import { useCallback, useEffect, useRef, useState } from 'react';
import { isAccessToken, type GitHubMessage, type GitHubState, type SyncStatus } from '../github/types';
import { request } from './client';
import { InfoTip } from './InfoTip';
import { WorkspaceIcon } from './WorkspaceIcon';

export function useGitHub() {
  const [state, setState] = useState<GitHubState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const working = useRef(false);
  const queued = useRef<GitHubMessage | null>(null);
  const mounted = useRef(false);
  const send = useCallback(async (message: GitHubMessage) => {
    if (working.current) {
      if (message.type === 'GITHUB_CANCEL_SYNC') { queued.current = message; setPaused(true); }
      return;
    }
    working.current = true; setBusy(true); setError(''); setPaused(false);
    try {
      const reply = await request(message);
      if (!reply.ok || !('kind' in reply.value) || reply.value.kind !== 'github') throw new Error('GitHub 状态响应无效。');
      if (mounted.current) setState(reply.value);
    } catch (reason: unknown) {
      if (mounted.current) {
        if (message.type !== 'GITHUB_READ') setError(reason instanceof Error ? reason.message : 'GitHub 操作失败。');
        setPaused(true);
      }
      // Initial reads are silent; recover local state only after a failed operation.
      if (message.type !== 'GITHUB_READ') try {
        const reply = await request({ type: 'GITHUB_READ' });
        if (mounted.current && reply.ok && 'kind' in reply.value && reply.value.kind === 'github') setState(reply.value);
      } catch { /* Keep the last visible state until the user retries. */ }
    } finally {
      working.current = false;
      if (mounted.current) {
        setBusy(false);
        if (message.type === 'GITHUB_READ') setLoading(false);
        const next = queued.current; queued.current = null;
        if (next) void send(next);
      }
    }
  }, []);
  useEffect(() => { mounted.current = true; void send({ type: 'GITHUB_READ' }); return () => { mounted.current = false; }; }, [send]);
  useEffect(() => {
    if (!state || busy || paused) return;
    const running = state.accounts.find(item => item.sync?.state === 'running');
    if (!running) return;
    const timer = window.setTimeout(() => void send({ type: 'GITHUB_STEP', accountId: running.account.accountId }), 250);
    return () => window.clearTimeout(timer);
  }, [state, busy, paused, send]);
  const refreshKey = state?.accounts.map(item => item.account.accountId + ':' + (item.account.lastSyncedAt ?? '')).join('|') ?? '';
  const clearError = useCallback(() => setError(''), []);
  return { state, busy, loading, error, clearError, send, refreshKey };
}
export type GitHubController = ReturnType<typeof useGitHub>;
const formatTime = (time?: string) => time ? new Date(time).toLocaleString('zh-CN') : '尚未同步';
const STAGES: { value: SyncStatus['phase']; label: string }[] = [
  { value: 'stars', label: '读取 Stars' },
  { value: 'lists', label: '读取 Lists' },
  { value: 'items', label: '读取归属' },
  { value: 'commit', label: '保存快照' },
];
const STATE_LABEL: Partial<Record<SyncStatus['state'], string>> = {
  running: '同步中', succeeded: '上次同步成功', failed: '同步失败', cancelled: '已取消',
  queued: '等待中', retry_wait: '限流等待中', needs_review: '需要确认',
};

function SyncProgress({ sync }: { sync: SyncStatus }) {
  const current = STAGES.findIndex(stage => stage.value === sync.phase);
  return <div className="sync-progress">
    <ol className="sync-stages">
      {STAGES.map((stage, index) => <li key={stage.value}
        className={index === current ? 'current' : index < current ? 'done' : undefined}>
        <b aria-hidden="true">{String(index + 1).padStart(2, '0')}</b>{stage.label}
      </li>)}
    </ol>
    <p className="sync-counts" role="status">已读取 {sync.repositories} 个项目、{sync.lists} 个 Lists、{sync.memberships} 条归属。关闭管理页会暂停，重新打开后继续。</p>
  </div>;
}

export function GitHubSettings({ github }: { github: GitHubController }) {
  const { state, busy, loading, error, clearError, send } = github;
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const submit = () => {
    const value = token.trim();
    if (busy || !isAccessToken(value)) return;
    setToken('');
    void send({ type: 'GITHUB_CONNECT', token: value, remember });
  };
  return <>
    <header className="settings-panel-head">
      <h2 id="settings-github-title">GitHub</h2>
    </header>
    <div className="settings-panel-body">
      <form className="settings-form" onSubmit={event => { event.preventDefault(); submit(); }}>
        <div className="field">
          <div className="field-head">
            <span className="field-label">
              <label htmlFor="github-access-token">Access Token</label>
              <InfoTip label="验证范围说明">验证会读取账号身份，并探测 Stars、Lists 与首个可见 List 的 items；实际可见范围取决于 Token 权限与组织策略。</InfoTip>
            </span>
            <a className="field-link" href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">获取 Token<WorkspaceIcon name="external" /></a>
          </div>
          <input id="github-access-token" className="field-input" type="password" value={token} maxLength={1024}
            autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="粘贴 GitHub Personal Access Token"
            disabled={busy} onChange={event => { setToken(event.target.value); clearError(); }} />
        </div>
        <div className="field">
          <div className="checkbox-line">
            <label className="checkbox-row" htmlFor="github-remember">
              <input id="github-remember" type="checkbox" checked={remember} disabled={busy}
                onChange={event => setRemember(event.target.checked)} />
              在此设备记住 Token
            </label>
            <InfoTip label="凭证存储说明">勾选后写入本地存储，它不是加密保险箱；不勾选则只在当前浏览器会话有效。Token 只发往 api.github.com，不会回填到输入框。</InfoTip>
          </div>
        </div>
        <div className="action-row settings-actions">
          <button className="button" disabled={busy || !isAccessToken(token.trim())} type="submit">{busy ? '处理中…' : '验证并保存'}</button>
        </div>
      </form>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <fieldset className="settings-fieldset">
        <legend><span className="legend-row">已连接的账号<InfoTip label="同步机制说明">关闭管理页会暂停分页，重新打开后从已保存的页面继续；读取完成前始终显示原快照。Token 过期或被撤销后需要更换并重新验证。</InfoTip></span></legend>
        {loading && <p className="inline-status" role="status">正在读取 GitHub 连接状态…</p>}
        {state && !state.accounts.length && !loading && <p className="inline-status">还没有连接任何账号。</p>}
        {state?.accounts.map(({ account, connected, remember: savedRemember, sync }) => <article className="account" key={account.accountId}>
          <div className="account-head">
            <span className="account-avatar" aria-hidden="true">{account.login.slice(0, 1).toUpperCase()}</span>
            <h3>{account.login}</h3>
            <span className={'state-badge' + (connected ? ' live' : '')}><i aria-hidden="true" />{connected ? '已连接' : '未连接'}</span>
            {connected && <span className="state-badge">{savedRemember ? '凭证保存在此设备' : '凭证仅在当前会话'}</span>}
            {sync && <span className={'state-badge' + (sync.state === 'failed' ? ' warn' : '')}>{STATE_LABEL[sync.state] ?? '同步状态未知'}</span>}
          </div>
          <dl className="account-facts">
            <div><dt>上次成功同步</dt><dd>{formatTime(account.lastSyncedAt)}</dd></div>
            <div><dt>本地快照</dt><dd>{sync ? `${sync.repositories} 个项目 · ${sync.lists} 个 Lists` : '尚无同步记录'}</dd></div>
          </dl>
          {sync?.state === 'running' && <SyncProgress sync={sync} />}
          <div className="account-actions">
            <button className="button" disabled={busy || !connected || sync?.state === 'running'}
              onClick={() => void send({ type: 'GITHUB_SYNC', accountId: account.accountId })}>
              <WorkspaceIcon name="refresh" />{sync?.state === 'running' ? '同步中…' : '同步收藏'}
            </button>
            {sync?.state === 'running' && <button className="button secondary" disabled={busy}
              onClick={() => void send({ type: 'GITHUB_CANCEL_SYNC', accountId: account.accountId })}>取消同步</button>}
            {sync?.state === 'succeeded' && <span className="inline-status"><WorkspaceIcon name="check" />同步完成，收藏页已更新。</span>}
            {sync?.state === 'cancelled' && <span className="inline-status">同步已取消，原快照保留。</span>}
          </div>
          {sync?.error && <p className="inline-error" role="alert">{sync.error}</p>}
          <div className="danger-block">
            <h3>移除此设备凭证</h3>
            <p>只删除本机保存的 Token 并取消未完成的同步；本地快照、标签与笔记保留。</p>
            {confirming === account.accountId
              ? <div className="action-row">
                <button className="button danger confirming" disabled={busy}
                  onClick={() => { setConfirming(null); void send({ type: 'GITHUB_DISCONNECT', accountId: account.accountId }); }}>确认移除</button>
                <button className="button secondary" onClick={() => setConfirming(null)}>取消</button>
              </div>
              : <button className="button danger" disabled={busy}
                onClick={() => setConfirming(account.accountId)}>移除此设备凭证</button>}
          </div>
        </article>)}
      </fieldset>
    </div>
  </>;
}
