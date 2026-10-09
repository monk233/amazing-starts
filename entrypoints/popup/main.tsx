import React from 'react';
import ReactDOM from 'react-dom/client';
import { Brand } from '../../src/ui/Brand';
import { request } from '../../src/ui/client';
import { useFoundation } from '../../src/ui/use-foundation';
import '../../src/ui/tokens.css';

function Popup() {
  const { status, error } = useFoundation();
  const [openError, setOpenError] = React.useState<string | null>(null);
  const open = async () => {
    try { await request({ type: 'OPEN_MANAGER' }); window.close(); }
    catch { setOpenError('暂时无法打开管理页，请重新加载扩展后重试。'); }
  };
  return <div className="popup"><Brand /><span className="build-note">M1 基础工程预览</span>
    <h1>你的收藏工作区</h1><p className="note">GitHub 登录与同步尚未接入。当前不会读取或修改你的收藏。</p>
    <button className="button" onClick={() => void open()}>打开管理页面</button>
    <p className="status" role="status">{status ? '本地数据层已就绪' : '正在连接本地工作区…'}</p>
    {(error || openError) && <p role="alert" className="error">{openError ?? error}</p>}
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Popup /></React.StrictMode>);
