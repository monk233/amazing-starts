import { WorkspaceIcon } from './WorkspaceIcon';

export function DataBoundary() {
  return <>
    <header className="settings-panel-head">
      <h2 id="settings-boundary-title">数据边界</h2>
    </header>
    <div className="settings-panel-body">
      <div className="boundary-grid">
        <div className="boundary-column">
          <h3><WorkspaceIcon name="lock" />仅此设备</h3>
          <ul>
            <li>本地数据库按 GitHub 账号划分，以稳定账号 ID 隔离，账号之间不串联。</li>
            <li>维度、标签和未来的手册只保存在本机，没有跨设备云同步。</li>
            <li>Access Token 与 API Key 默认只留在浏览器会话；勾选记住才写入本地存储。</li>
          </ul>
        </div>
        <div className="boundary-column">
          <h3><WorkspaceIcon name="external" />会发送出去</h3>
          <ul>
            <li>读取 Stars、Lists 与归属的只读请求发往 api.github.com，使用你填写的 Token。</li>
            <li>扩展目前没有调用任何创建或修改远端 Lists 的接口。</li>
            <li>AI 请求只发往你保存的服务地址，且只在手动测试或获取模型目录时发生，不包含仓库内容。</li>
          </ul>
        </div>
      </div>
      <p className="boundary-note">清除扩展数据或卸载扩展可能丢失本地快照与笔记。不要把 Token 或 API Key 写进项目文件。</p>
    </div>
  </>;
}
