import type { Appearance } from '../data/types';
import { InfoTip } from './InfoTip';
import { ModeIcon } from './ModeIcon';
import { WorkspaceIcon } from './WorkspaceIcon';

const THEMES = [
  { value: 'folio', label: '纸页收藏馆', note: '平静、有序，像自己的编辑目录。适合阅读、手册与长期整理。' },
  { value: 'observatory', label: '轨道观测室', note: '清楚、有坐标感，像自己的探索工作台。适合对比与开发工具。' },
] as const;

const MODES = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
] as const;

export function AppearanceSettings({ appearance, saving, onChange }: {
  appearance: Appearance | undefined;
  saving: boolean;
  onChange: (patch: Partial<Appearance>) => void;
}) {
  const disabled = !appearance || saving;
  const status = saving ? '正在保存外观设置…' : appearance ? '外观设置已保存。' : '正在读取外观设置…';
  return <>
    <header className="settings-panel-head">
      <h2 id="settings-appearance-title">外观</h2>
    </header>
    <div className="settings-panel-body">
      <fieldset className="settings-fieldset" disabled={disabled}>
        <legend><span className="legend-row">主题<InfoTip label="外观作用范围">主题与明暗模式只影响这台设备上的显示，不修改任何远端数据。</InfoTip></span></legend>
        <div className="theme-choices">
          {THEMES.map(theme => <label className="theme-card" data-preview={theme.value} key={theme.value}>
            <input type="radio" name="theme" value={theme.value}
              checked={appearance?.theme === theme.value} onChange={() => onChange({ theme: theme.value })} />
            <span className="theme-check" aria-hidden="true"><WorkspaceIcon name="check" /></span>
            <span className="theme-thumb" aria-hidden="true">
              <span className="theme-thumb-rail"><i /><i /><i /></span>
              <span className="theme-thumb-body"><b /><b /><b /><b /></span>
            </span>
            <span className="theme-card-copy"><strong>{theme.label}</strong><small>{theme.note}</small></span>
          </label>)}
        </div>
      </fieldset>
      <fieldset className="settings-fieldset" disabled={disabled}>
        <legend>明暗模式</legend>
        <div className="mode-segments">
          {MODES.map(mode => <label className="mode-segment" key={mode.value}>
            <input type="radio" name="mode" value={mode.value}
              checked={appearance?.mode === mode.value} onChange={() => onChange({ mode: mode.value })} />
            <ModeIcon mode={mode.value} /><span>{mode.label}</span>
          </label>)}
        </div>
      </fieldset>
      <p className="inline-status" role="status" aria-live="polite">
        {appearance && !saving && <WorkspaceIcon name="check" />}{status}
      </p>
    </div>
  </>;
}
