import { describe, expect, it } from 'vitest';
import { isAppearance, SettingsStore } from '../../src/data/settings';
import { MemoryStorage } from '../helpers/storage';

describe('本地外观设置', () => {
  it('defaults to system mode without overwriting storage', async () => {
    const storage = new MemoryStorage();
    expect((await new SettingsStore(storage).read()).appearance.mode).toBe('system');
    expect(storage.items).toEqual({});
  });
  it('persists only supported appearance values', async () => {
    const store = new SettingsStore(new MemoryStorage());
    await store.setAppearance({ theme: 'observatory', mode: 'dark' });
    expect((await store.read()).appearance).toEqual({ theme: 'observatory', mode: 'dark' });
  });
  it('rejects unknown fields instead of persisting injected credentials', () => {
    expect(isAppearance({ theme: 'folio', mode: 'light', apiKey: 'not-a-real-key' })).toBe(false);
    expect(isAppearance({ theme: 'unknown', mode: 'dark' })).toBe(false);
  });
  it('never resets unknown settings versions', async () => {
    const storage = new MemoryStorage();
    storage.items['settings:v1'] = { version: 99, retained: true };
    const store = new SettingsStore(storage);
    await expect(store.read()).rejects.toThrow('版本');
    await expect(store.setAppearance({ theme: 'folio', mode: 'dark' })).rejects.toThrow('版本');
    expect(storage.items['settings:v1']).toEqual({ version: 99, retained: true });
  });
});
