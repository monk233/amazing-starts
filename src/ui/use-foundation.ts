import { useCallback, useEffect, useState } from 'react';
import type { Status } from '../messaging';
import type { Appearance } from '../data/types';
import { request } from './client';
import { applyAppearance } from './theme';

export function useFoundation() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try {
      const reply = await request({ type: 'GET_STATUS' });
      if (reply.ok && 'phase' in reply.value) setStatus(reply.value);
      else throw new Error('后台响应格式不正确。');
    } catch (error: unknown) { setError(error instanceof Error ? error.message : '扩展初始化失败。'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => status ? applyAppearance(status.settings.appearance) : undefined, [status]);

  const saveAppearance = async (appearance: Appearance) => {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const reply = await request({ type: 'SET_APPEARANCE', appearance });
      if (reply.ok && 'appearance' in reply.value) {
        const settings = reply.value;
        setStatus(previous => previous ? { ...previous, settings } : previous);
      } else throw new Error('外观设置未保存。');
    } catch (error: unknown) { setError(error instanceof Error ? error.message : '保存失败，请重试。'); }
    finally { setSaving(false); }
  };
  return { status, error, saving, load, saveAppearance };
}
