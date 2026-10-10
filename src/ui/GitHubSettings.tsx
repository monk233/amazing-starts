import { useCallback, useEffect, useRef, useState } from 'react';
import { isAccessToken, type GitHubMessage, type GitHubState } from '../github/types';
import { request } from './client';

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
const phases = { stars: '读取 Stars', lists: '读取 Lists', items: '读取 List 归属', commit: '保存完整快照' };

export function GitHubSettings({ github }: { github: GitHubController }) {
  const { state, busy, loading, error, clearError, send } = github;
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(false);
  const submit = () => {
    const value = token.trim();
    if (busy || !isAccessToken(value)) return;
    setToken('');
    void send({ type: 'GITHUB_CONNECT', token: value, remember });
  };
  return <section className="settings-section github-settings" aria-labelledby="github-title"><h2 id="github-title">GitHub</h2>
    <p>填写 Personal Access Token，验证账号后同步 Stars、Lists 与分类归属。</p>
    <form onSubmit={event => { event.preventDefault(); submit(); }}>
      <label className="field-label" htmlFor="github-access-token">Access Token</label>
      <input id="github-access-token" className="text-input" type="password" value={token} maxLength={1024} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="粘贴 GitHub Personal Access Token" disabled={busy} onChange={event => { setToken(event.target.value); clearError(); }}/>
      <p className="note">从 <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">GitHub Token 设置</a> 获取。验证会检查账号与 Stars／Lists 读取接口；可见范围取决于 Token 权限及组织策略。</p>
      <label className="github-remember"><input type="checkbox" checked={remember} disabled={busy} onChange={event => setRemember(event.target.checked)}/>在此设备记住 Token</label>
      <p className="note">默认仅当前浏览器会话有效。勾选后写入本地存储，存储不是加密保险箱。Token 仅发送至 GitHub API，不会回填到输入框。</p>
      <button className="button" disabled={busy || !isAccessToken(token.trim())} type="submit">{busy ? '处理中…' : '验证并保存'}</button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    {loading && <p role="status">正在读取 GitHub 配置…</p>}
    {state?.accounts.map(({ account, connected, remember: savedRemember, sync }) => <article className="github-account" key={account.accountId}>
      <h3>{account.login}</h3><p>{connected ? savedRemember ? '已连接 · 此设备保存凭证' : '已连接 · 当前浏览器会话' : '未连接 · 本地快照仍可浏览'}</p>
      <p className="note">上次成功同步：{formatTime(account.lastSyncedAt)}</p>
      <div className="github-actions"><button className="button" disabled={busy || !connected || sync?.state === 'running'} onClick={() => void send({ type: 'GITHUB_SYNC', accountId: account.accountId })}>{sync?.state === 'running' ? '同步中…' : '同步收藏'}</button>
        {sync?.state === 'running' && <button className="button secondary" onClick={() => void send({ type: 'GITHUB_CANCEL_SYNC', accountId: account.accountId })}>取消同步</button>}
        <button className="button secondary" disabled={busy} onClick={() => void send({ type: 'GITHUB_DISCONNECT', accountId: account.accountId })}>移除此设备凭证</button></div>
      {sync?.state === 'running' && <p role="status">{phases[sync.phase]}：{sync.repositories} 个项目、{sync.lists} 个 Lists、{sync.memberships} 条归属。</p>}
      {sync?.state === 'succeeded' && <p role="status">同步完成，收藏页已更新。</p>}
      {sync?.state === 'cancelled' && <p role="status">同步已取消，原快照保留。</p>}
      {sync?.error && <p role="alert" className="error">{sync.error}</p>}
    </article>)}
    <p className="note">同步期间可切换页面。关闭管理页会暂停，重新打开后继续；读取完成前保留原快照。移除仅删除此设备凭证，保留本地快照；Token 过期或被撤销后需更换并重新验证。</p>
  </section>;
}
