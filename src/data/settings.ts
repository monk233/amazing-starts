import type { Appearance, Settings } from './types';
import type { StorageArea } from './storage';

const KEY = 'settings:v1';
export const DEFAULT_APPEARANCE: Appearance = { theme: 'folio', mode: 'system' };
export const isAppearance = (value: unknown): value is Appearance => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 2 &&
    (item.theme === 'folio' || item.theme === 'observatory') &&
    (item.mode === 'system' || item.mode === 'light' || item.mode === 'dark');
};

export class SettingsStore {
  constructor(private readonly storage: StorageArea) {}

  async read(): Promise<Settings> {
    const raw = (await this.storage.get(KEY))[KEY];
    if (raw === undefined) return { version: 1, appearance: { ...DEFAULT_APPEARANCE } };
    if (!raw || typeof raw !== 'object') throw new Error('本地设置格式损坏，未覆盖原数据。');
    const value = raw as Record<string, unknown>;
    if (value.version !== 1) throw new Error('设置版本不受支持，请使用兼容版本的扩展。');
    if (!isAppearance(value.appearance)) throw new Error('外观设置无效，未覆盖原数据。');
    return { version: 1, appearance: value.appearance };
  }

  async setAppearance(appearance: Appearance): Promise<Settings> {
    if (!isAppearance(appearance)) throw new Error('外观设置无效。');
    await this.read();
    const settings: Settings = { version: 1, appearance: { ...appearance } };
    await this.storage.set({ [KEY]: settings });
    return settings;
  }
}
