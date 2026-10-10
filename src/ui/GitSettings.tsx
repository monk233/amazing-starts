import { useState, type KeyboardEvent } from 'react';
import type { GitAccountState, SyncPhase, SyncStatus } from '../git/types';
import { isGitToken } from '../git/types';
import type { GitProvider, SyncMode } from '../data/types';
import { InfoTip } from './InfoTip';
import { SelectMenu } from './SelectMenu';
import { WorkspaceIcon } from './WorkspaceIcon';
import type { GitController } from './use-git';

const PROVIDERS: { id: GitProvider; label: string; tokenUrl: string; tokenLink: string; tokenLabel: string; hint: string }[] = [
  {
    id: 'github', label: 'GitHub', tokenUrl: 'https://github.com/settings/tokens', tokenLink: '获取 Token', tokenLabel: 'Access Token',
    hint: '读取 Stars、Lists 与归属的只读请求发往 api.github.com。',
  },
  {
    id: 'gitee', label: 'Gitee', tokenUrl: 'https://gitee.com/profile/personal_access_tokens', tokenLink: '获取私人令牌', tokenLabel: '私人令牌',
    hint: '读取 Stars 的只读请求发往 gitee.com/api/v5。Gitee 没有 Lists，分类需要手动创建。',
  },
];
const PHASE_LABEL: Record<SyncPhase, string> = { stars: '读取 Stars', lists: '读取 Lists', items: '读取归属', commit: '保存快照' };
const STATE_LABEL: Partial<Record<SyncStatus['state'], string>> = {
  running: '同步中', succeeded: '上次同步成功', failed: '同步失败', cancelled: '已取消',
  queued: '等待中', retry_wait: '限流等待中', needs_review: '需要确认',
};
const stagesFor = (provider: GitProvider, mode: SyncMode): SyncPhase[] =>
  provider === 'gitee' || mode === 'stars' ? ['stars', 'commit'] : ['stars', 'lists', 'items', 'commit'];
const formatTime = (time?: string) => time ? new Date(time).toLocaleString('zh-CN') : '尚未同步';

function SyncProgress({ sync, stages }: { sync: SyncStatus; stages: SyncPhase[] }) {
  const current = stages.indexOf(sync.phase);
  return <div className="sync-progress">
    <ol className="sync-stages">
      {stages.map((stage, index) => <li key={stage}
        className={index === current ? 'current' : index < current ? 'done' : undefined}>
        <b aria-hidden="true">{String(index + 1).padStart(2, '0')}</b>{PHASE_LABEL[stage]}
      </li>)}
    </ol>
    <p className="sync-counts" role="status">
      已读取 {sync.repositories} 个项目{sync.mode === 'stars+lists' ? `、${sync.lists} 个 Lists、${sync.memberships} 条归属` : ''}。关闭管理页会暂停，重新打开后继续。
    </p>
  </div>;
}

function AccountRule({ item, busy, onSave }: { item: GitAccountState; busy: boolean; onSave: (mode: SyncMode) => void }) {
  if (item.provider === 'gitee') {
    return <p className="inline-status">同步规则：只同步 Stars（Gitee 没有 Lists）<InfoTip label="Gitee 规则说明">Gitee 的收藏列表接口不返回分类，也没有收藏时间；同步只更新项目本身，分类由你在收藏页手动维护。</InfoTip></p>;
  }
  return <div className="rule-row">
    <span>同步规则</span>
    <SelectMenu label="同步规则" value={item.syncMode} disabled={busy || item.sync?.state === 'running'}
      options={[{ value: 'stars+lists', label: '同步 Stars 与 Lists' }, { value: 'stars', label: '只同步 Stars' }]}
      onChange={value => onSave(value as SyncMode)} />
    <InfoTip label="同步规则说明">
      <b>同步 Stars 与 Lists</b>：把远端 Lists 建立为本地分类，跟随远端的分类会按远端结果更新。<br />
      <b>只同步 Stars</b>：只更新项目，完全不动本地分类。<br />
      你在本地改名、改说明或拖动过归属的分类会脱离远端跟踪，不再被覆盖。
    </InfoTip>
  </div>;
}

function ProviderPanel({ git, provider }: { git: GitController; provider: GitProvider }) {
  const { state, busy, loading, error, clearError, send } = git;
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const config = PROVIDERS.find(item => item.id === provider)!;
  const accounts = state?.accounts.filter(item => item.provider === provider) ?? [];
  const submit = () => {
    const value = token.trim();
    if (busy || !isGitToken(provider, value)) return;
    setToken('');
    void send({ type: 'GIT_CONNECT', provider, token: value, remember });
  };
  return <>
    <form className="settings-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="field">
        <div className="field-head">
          <span className="field-label">
            <label htmlFor={provider + '-access-token'}>{config.tokenLabel}</label>
            <InfoTip label="连接说明">一个平台可以连接多个账号：每次验证成功都会新增一个账号，各自保存凭证、同步规则与快照。{config.hint}</InfoTip>
          </span>
          <a className="field-link" href={config.tokenUrl} target="_blank" rel="noopener noreferrer">{config.tokenLink}<WorkspaceIcon name="external" /></a>
        </div>
        <input id={provider + '-access-token'} className="field-input" type="password" value={token} maxLength={1024}
          autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={`粘贴 ${config.label} ${config.tokenLabel}`}
          disabled={busy} onChange={event => { setToken(event.target.value); clearError(); }} />
      </div>
      <div className="field">
        <div className="checkbox-line">
          <label className="checkbox-row" htmlFor={provider + '-remember'}>
            <input id={provider + '-remember'} type="checkbox" checked={remember} disabled={busy}
              onChange={event => setRemember(event.target.checked)} />
            在此设备记住令牌
          </label>
          <InfoTip label="凭证存储说明">勾选后写入本地存储，它不是加密保险箱；不勾选则只在当前浏览器会话有效。令牌只发往 {provider === 'github' ? 'api.github.com' : 'gitee.com'}，不会回填到输入框。</InfoTip>
        </div>
      </div>
      <div className="action-row settings-actions">
        <button className="button" disabled={busy || !isGitToken(provider, token.trim())} type="submit">{busy ? '处理中…' : '验证并保存'}</button>
      </div>
    </form>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <fieldset className="settings-fieldset">
      <legend><span className="legend-row">{config.label} 账号<InfoTip label="同步机制说明">逐个账号同步：一次只推进一个账号的一页数据，读取完成前始终显示原快照。在收藏页左下角切换当前工作账号。</InfoTip></span></legend>
      {loading && <p className="inline-status" role="status">正在读取 {config.label} 连接状态…</p>}
      {state && !accounts.length && !loading && <p className="inline-status">还没有连接 {config.label} 账号。</p>}
      {accounts.map(item => <article className="account" key={item.account.accountId}>
        <div className="account-head">
          <span className="account-avatar" aria-hidden="true">{item.account.login.slice(0, 1).toUpperCase()}</span>
          <h3>{item.account.login}</h3>
          <span className={'state-badge' + (item.connected ? ' live' : '')}><i aria-hidden="true" />{item.connected ? '已连接' : '未连接'}</span>
          {item.connected && <span className="state-badge">{item.remember ? '凭证保存在此设备' : '凭证仅在当前会话'}</span>}
          {item.sync && <span className={'state-badge' + (item.sync.state === 'failed' ? ' warn' : '')}>{STATE_LABEL[item.sync.state] ?? '同步状态未知'}</span>}
        </div>
        <dl className="account-facts">
          <div><dt>上次成功同步</dt><dd>{formatTime(item.account.lastSyncedAt)}</dd></div>
          <div><dt>本地快照</dt><dd>{item.sync ? `${item.sync.repositories} 个项目${item.sync.mode === 'stars+lists' ? ` · ${item.sync.lists} 个 Lists` : ''}` : '尚无同步记录'}</dd></div>
        </dl>
        <AccountRule item={item} busy={busy} onSave={mode => void send({ type: 'GIT_RULE_SAVE', accountId: item.account.accountId, mode })} />
        {item.sync?.state === 'running' && <SyncProgress sync={item.sync} stages={stagesFor(provider, item.sync.mode)} />}
        <div className="account-actions">
          <button className="button" disabled={busy || !item.connected || item.sync?.state === 'running'}
            onClick={() => void send({ type: 'GIT_SYNC', accountId: item.account.accountId })}>
            <WorkspaceIcon name="refresh" />{item.sync?.state === 'running' ? '同步中…' : '同步收藏'}
          </button>
          {item.sync?.state === 'running' && <button className="button secondary" disabled={busy}
            onClick={() => void send({ type: 'GIT_CANCEL_SYNC', accountId: item.account.accountId })}>取消同步</button>}
          {item.sync?.state === 'succeeded' && <span className="inline-status"><WorkspaceIcon name="check" />同步完成，收藏页已更新。</span>}
          {item.sync?.state === 'cancelled' && <span className="inline-status">同步已取消，原快照保留。</span>}
        </div>
        {item.sync?.error && <p className="inline-error" role="alert">{item.sync.error}</p>}
        <div className="danger-block">
          <h3>移除此设备凭证</h3>
          <p>只删除本机保存的令牌并取消未完成的同步；本地快照、分类与标签保留。</p>
          {confirming === item.account.accountId
            ? <div className="action-row">
              <button className="button danger confirming" disabled={busy}
                onClick={() => { setConfirming(null); void send({ type: 'GIT_DISCONNECT', accountId: item.account.accountId }); }}>确认移除</button>
              <button className="button secondary" onClick={() => setConfirming(null)}>取消</button>
            </div>
            : <button className="button danger" disabled={busy}
              onClick={() => setConfirming(item.account.accountId)}>移除此设备凭证</button>}
        </div>
      </article>)}
    </fieldset>
  </>;
}

/** Git 设置：平台子标签，每个平台一份多账号配置。 */
export function GitSettings({ git }: { git: GitController }) {
  const [provider, setProvider] = useState<GitProvider>('github');
  const select = (index: number) => setProvider(PROVIDERS[(index + PROVIDERS.length) % PROVIDERS.length]!.id);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); select(index + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); select(index - 1); }
  };
  const active = PROVIDERS.find(item => item.id === provider) ?? PROVIDERS[0]!;
  return <>
    <header className="settings-panel-head">
      <h2 id="settings-git-title">Git</h2>
      <p>分别连接 GitHub 与 Gitee 账号，逐个选择同步规则。分类与标签只保存在本机。</p>
    </header>
    <div className="settings-panel-body">
      <div className="settings-subtabs" role="tablist" aria-label="Git 平台">
        {PROVIDERS.map((item, index) => <button key={item.id} type="button" role="tab" id={'git-subtab-' + item.id}
          aria-selected={provider === item.id} aria-controls={'git-subpanel-' + item.id}
          tabIndex={provider === item.id ? 0 : -1}
          onClick={() => setProvider(item.id)} onKeyDown={event => onKeyDown(event, index)}>{item.label}</button>)}
      </div>
      <div role="tabpanel" id={'git-subpanel-' + active.id} aria-labelledby={'git-subtab-' + active.id}>
        <ProviderPanel git={git} provider={active.id} />
      </div>
    </div>
  </>;
}
