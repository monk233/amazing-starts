import { GitHubSettings, useGitHub } from '../../src/ui/GitHubSettings';
import { Library } from '../../src/ui/Library';
import { AiSettings } from '../../src/ui/AiSettings';
import { ModeIcon } from '../../src/ui/ModeIcon';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useFoundation } from '../../src/ui/use-foundation';
import type { Appearance } from '../../src/data/types';
import '../../src/ui/tokens.css';

function App() {
  const github = useGitHub();
  const { status, error, saving, load, saveAppearance } = useFoundation();
  const [route, setRoute] = useState(location.hash === '#settings' ? 'settings' : 'library');
  useEffect(() => {
    const onHash = () => setRoute(location.hash === '#settings' ? 'settings' : 'library');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const appearance = status?.settings.appearance;
  const change = (patch: Partial<Appearance>) => { if (appearance) void saveAppearance({ ...appearance, ...patch }); };
  return <Library github={github} route={route} notice={<>
    {error && <div role="alert" className="error">{error} <button className="button secondary" onClick={() => void load()}>重试</button></div>}
    {!status && !error && <p className="loading" role="status">正在打开本地工作区…</p>}
  </>}>
        <section className="settings-section"><h2>外观</h2>
          <p className="note">选择主题与明暗模式，偏好仅保存在此设备。</p>
          <fieldset disabled={!appearance || saving}><legend>主题</legend><div className="choices">
            {([['folio', '纸页收藏馆'], ['observatory', '轨道观测室']] as const).map(([value, label]) => <label className="choice" key={value}><input type="radio" name="theme" value={value} checked={appearance?.theme === value} onChange={() => change({ theme: value })} />{label}</label>)}
          </div></fieldset>
          <fieldset disabled={!appearance || saving}><legend>明暗模式</legend><div className="choices">
            {([['system', '跟随系统'], ['light', '亮色'], ['dark', '暗色']] as const).map(([value, label]) => <label className="choice mode-choice" key={value} title={label}><input type="radio" name="mode" aria-label={label} value={value} checked={appearance?.mode === value} onChange={() => change({ mode: value })} /><ModeIcon mode={value} /></label>)}
          </div></fieldset><p className="status" role="status">{saving ? '正在保存…' : status ? '外观设置已保存。' : '正在连接本地工作区。'}</p>
        </section>
        <GitHubSettings github={github} />
        <AiSettings />
        <section className="settings-section"><h2>数据边界</h2><p>本地数据库已按 GitHub 账号划分存储。GitHub 同步由你主动发起；本地标签和手册不会上传至 GitHub。</p><p className="note">清除扩展数据或卸载扩展可能导致本地资料丢失。</p></section>
  </Library>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
