import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { normalizeBaseUrl, permissionOrigin, type AiState } from '../ai/config';
import { request } from './client';
import { InfoTip } from './InfoTip';

export function AiSettings() {
  const [saved, setSaved] = useState<AiState | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [remember, setRemember] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState('加载配置');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    void request({ type: 'AI_READ' }).then(reply => {
      if (!active) return;
      if (!reply.ok || !('config' in reply.value)) throw new Error('AI 配置响应无效。');
      setSaved(reply.value);
      setBaseUrl(reply.value.config?.baseUrl ?? '');
      setModel(reply.value.config?.model ?? '');
      setRemember(reply.value.config?.remember ?? false);
    }).catch(() => { if (active) setError('无法加载 AI 配置，请重新打开管理页。'); })
      .finally(() => { if (active) setBusy(''); });
    return () => { active = false; };
  }, []);

  const dirty = !saved?.config || baseUrl.trim().replace(/\/+$/, '') !== saved.config.baseUrl ||
    model.trim() !== saved.config.model || remember !== saved.config.remember || !!apiKey;
  function change() { setNotice(''); setError(''); }
  async function save() {
    setBusy('保存'); change();
    try {
      const normalized = normalizeBaseUrl(baseUrl);
      const reply = await request({ type: 'AI_SAVE', config: { baseUrl: normalized, apiKey, model, remember } });
      if (!reply.ok || !('config' in reply.value)) throw new Error('AI 配置响应无效。');
      setSaved(reply.value); setBaseUrl(normalized); setApiKey('');
      setNotice('配置已保存。API Key 不会回填到表单。');
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败，请重试。'); }
    finally { setBusy(''); }
  }
  async function connect(type: 'AI_TEST' | 'AI_MODELS') {
    if (dirty || !saved?.config || !saved.hasApiKey) return;
    setBusy(type === 'AI_TEST' ? '测试连接' : '获取模型目录'); change();
    if (type === 'AI_MODELS') setModels([]);
    try {
      // 权限请求必须直接源自点击，不在后台或页面加载时发起。
      const allowed = await browser.permissions.request({ origins: [permissionOrigin(saved.config.baseUrl)] });
      if (!allowed) throw new Error('未获得服务主机访问权限，没有发送请求。');
      const reply = await request({ type, baseUrl: saved.config.baseUrl });
      if (reply.ok && 'models' in reply.value) {
        setModels(reply.value.models);
        setNotice(reply.value.models.length ? `已获取 ${reply.value.models.length} 个模型。选择后请保存。` : '服务返回空模型目录，可以手动填写模型。');
      } else if (reply.ok && 'modelCount' in reply.value) {
        setNotice(`模型目录接口可访问，返回 ${reply.value.modelCount} 个模型；尚未验证模型生成能力。`);
      } else throw new Error('服务响应无效。');
    } catch (error) { setError(error instanceof Error ? error.message : '请求失败，请重试。'); }
    finally { setBusy(''); }
  }
  return <>
    <header className="settings-panel-head">
      <h2 id="settings-ai-title">AI 服务</h2>
    </header>
    <div className="settings-panel-body">
      <form className="settings-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset className="settings-fieldset" disabled={!!busy || !saved}>
          <legend><span className="legend-row">服务配置<InfoTip label="AI 边界说明">兼容 Bearer 认证与 <code>GET /models</code>；只做配置校验与模型目录读取，不发送仓库内容，也不调用模型生成接口。</InfoTip></span></legend>
          <div className="field">
            <div className="field-head">
              <span className="field-label">
                <label htmlFor="ai-base-url">Base URL</label>
                <InfoTip label="Base URL 说明">填写服务 API 根路径，不要带 <code>/models</code>：扩展会在其后请求模型目录。更换完整地址后必须重新输入 API Key；仅 HTTPS，localhost 与 127.0.0.1 允许 HTTP。</InfoTip>
              </span>
            </div>
            <input id="ai-base-url" className="field-input" type="url" required maxLength={2048} placeholder="https://your-provider.example/v1" value={baseUrl} onChange={event => { setBaseUrl(event.target.value); setApiKey(''); setModels([]); change(); }} />
          </div>
          <div className="field">
            <div className="field-label"><label htmlFor="ai-api-key">API Key</label></div>
            <input id="ai-api-key" className="field-input" type="password" autoComplete="new-password" spellCheck={false} maxLength={16_384} value={apiKey} placeholder={saved?.hasApiKey ? '已保存；留空保留当前地址的 Key' : '输入 API Key'} onChange={event => { setApiKey(event.target.value); setModels([]); change(); }} />
            <div className="checkbox-line">
              <label className="checkbox-row" htmlFor="ai-remember">
                <input id="ai-remember" type="checkbox" checked={remember} onChange={event => { setRemember(event.target.checked); change(); }} />
                在此设备记住凭证
              </label>
              <InfoTip label="凭证存储说明">勾选后写入本地存储，不是加密保险箱；不勾选只在当前浏览器会话。Key 只发送到上面保存的地址。</InfoTip>
            </div>
          </div>
          <div className="field">
            <div className="field-label"><label htmlFor="ai-model">模型名称</label></div>
            <input id="ai-model" className="field-input" maxLength={256} value={model} placeholder="手动填写模型 ID，或先获取目录" onChange={event => { setModel(event.target.value); change(); }} />
            {models.length > 0 && <ul className="model-list" aria-label="已获取的模型目录">
              {models.map(id => <li key={id} className={id === model ? 'chosen' : ''}>
                <button className="model-choice" type="button" aria-pressed={id === model} onClick={() => { setModel(id); change(); }}>{id}</button>
              </li>)}
            </ul>}
          </div>
          <div className="action-row settings-actions">
            <button className="button" type="submit">保存配置</button>
            <button className="button secondary" type="button" disabled={dirty || !saved?.hasApiKey} onClick={() => void connect('AI_TEST')}>测试连接</button>
            <button className="button secondary" type="button" disabled={dirty || !saved?.hasApiKey} onClick={() => void connect('AI_MODELS')}>获取模型目录</button>
          </div>
        </fieldset>
      </form>
      {dirty && saved?.config && <p className="field-help">先保存配置，再测试连接或获取目录。</p>}
      {saved?.config && !saved.hasApiKey && <p className="field-help">当前会话没有可用 Key，请重新输入并保存。</p>}
      <p className="inline-status" role="status" aria-live="polite">{busy ? `正在${busy}…` : notice}</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  </>;
}
