import { useGitHub } from '../../src/ui/GitHubSettings';
import { Library } from '../../src/ui/Library';
import { SettingsTabs } from '../../src/ui/SettingsTabs';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useFoundation } from '../../src/ui/use-foundation';
import type { Appearance } from '../../src/data/types';
import '../../src/ui/tokens.css';
import '../../src/ui/settings.css';

// Anything starting with #settings keeps the settings route; other hashes fall back to the library.
const routeFromHash = () => location.hash.startsWith('#settings') ? 'settings' : 'library';

function App() {
  const github = useGitHub();
  const { status, error, saving, load, saveAppearance } = useFoundation();
  const [route, setRoute] = useState(routeFromHash);
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const appearance = status?.settings.appearance;
  const change = (patch: Partial<Appearance>) => { if (appearance) void saveAppearance({ ...appearance, ...patch }); };
  return <Library github={github} route={route} notice={<>
    {error && <div role="alert" className="error">{error} <button className="button secondary" onClick={() => void load()}>重试</button></div>}
  </>}>
    {status ? <div className="settings-page">
      <SettingsTabs appearance={appearance} saving={saving} onChange={change} github={github} />
    </div> : !error ? <div className="settings-skeleton" role="status" aria-label="正在打开本地工作区">
      <span className="skeleton-tabs" /><span className="skeleton-title" /><span className="skeleton-line" />
      <span className="skeleton-cards"><span /><span /></span>
    </div> : null}
  </Library>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
