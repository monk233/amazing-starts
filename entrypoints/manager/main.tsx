import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Brand, StarMark } from '../../src/ui/Brand';
import { useFoundation } from '../../src/ui/use-foundation';
import type { Appearance } from '../../src/data/types';
import '../../src/ui/tokens.css';

function App() {
  const { status, error, saving, load, saveAppearance } = useFoundation();
  const [route, setRoute] = useState(location.hash === '#settings' ? 'settings' : 'library');
  useEffect(() => {
    const onHash = () => setRoute(location.hash === '#settings' ? 'settings' : 'library');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const appearance = status?.settings.appearance;
  const change = (patch: Partial<Appearance>) => { if (appearance) void saveAppearance({ ...appearance, ...patch }); };
  return <div className="shell">
    <header className="topbar"><Brand /><span className="build-note">M1 · 基础工程预览，不代表完整功能</span></header>
    <nav className="navigation" aria-label="主导航">
      <a href="#library" aria-current={route === 'library' ? 'page' : undefined}>我的收藏</a>
      <a href="#settings" aria-current={route === 'settings' ? 'page' : undefined}>设置与准备</a>
    </nav>
    <main>
      {error && <div role="alert" className="error">{error} <button className="button secondary" onClick={() => void load()}>重试</button></div>}
      {!status && !error && <p className="loading" role="status">正在打开本地工作区…</p>}
      {route === 'library' ? <>
        <h1>给每一份收藏，一个好位置。</h1>
        <p className="lead">GitHub 分类留在 GitHub，个人的整理方式留在这里。</p>
        <section className="empty"><StarMark size={48} /><h2>尚未连接 GitHub</h2>
          <p>基础工作区已搭建。GitHub 授权与收藏同步将在下一阶段接入，这里不会用演示仓库冒充你的真实收藏。</p>
          <a className="button" href="#settings">查看连接准备</a>
        </section>
        <p className="note">当前不会修改 Star 或 Lists，也不会向 AI 服务发送请求。</p>
      </> : <>
        <h1>设置与连接准备</h1><p className="lead">先安放好你的工作区，再连接需要的服务。</p>
        <section className="settings-section"><h2>外观基础</h2>
          <p className="note">以下为候选色板，不是已经确认的最终艺术主题。外观设置仅保存在此设备。</p>
          <fieldset disabled={!appearance || saving}><legend>候选主题</legend><div className="choices">
            {([['folio', '纸页收藏馆'], ['observatory', '轨道观测室']] as const).map(([value, label]) => <label className="choice" key={value}><input type="radio" name="theme" value={value} checked={appearance?.theme === value} onChange={() => change({ theme: value })} />{label}</label>)}
          </div></fieldset>
          <fieldset disabled={!appearance || saving}><legend>明暗模式</legend><div className="choices">
            {([['system', '跟随系统'], ['light', '亮色'], ['dark', '暗色']] as const).map(([value, label]) => <label className="choice" key={value}><input type="radio" name="mode" value={value} checked={appearance?.mode === value} onChange={() => change({ mode: value })} />{label}</label>)}
          </div></fieldset><p className="status" role="status">{saving ? '正在保存…' : status ? '外观设置保存在本地；数据库已就绪。' : '正在连接本地工作区。'}</p>
        </section>
        <section className="settings-section"><h2>GitHub</h2><p>真实登录尚未接入。后续需要为 amazing-starts 注册 OAuth App、启用 Device Flow，并配置项目的 Client ID。</p><p className="note">Client ID 不是 Client Secret。不要将个人 GitHub Token 写入项目文件。</p></section>
        <section className="settings-section"><h2>AI 服务</h2><p>后续由你自行配置 Base URL、API Key 和模型。当前版本不收集 API Key，不进行连接测试或付费调用。</p></section>
        <section className="settings-section"><h2>数据边界</h2><p>本地数据库已按 GitHub 账号划分存储。真正的账号授权尚未实现，因此当前没有导入任何账户数据。</p><p className="note">清除扩展数据或卸载扩展可能导致本地资料丢失。</p></section>
      </>}
    </main>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
