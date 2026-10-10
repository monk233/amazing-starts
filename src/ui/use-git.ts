import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitMessage, GitState } from '../git/types';
import { request } from './client';

const MUTATES_LIBRARY = new Set<GitMessage['type']>(['GIT_CONNECT', 'GIT_DISCONNECT', 'GIT_CATEGORY_SAVE', 'GIT_CATEGORY_DELETE', 'GIT_CATEGORY_MOVE']);

/**
 * Owns one privileged conversation with the background service.
 * Messages are serialized: a cancel request typed while another call is in flight is queued instead of dropped.
 */
export function useGit() {
  const [state, setState] = useState<GitState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [revision, setRevision] = useState(0);
  const working = useRef(false);
  const queued = useRef<GitMessage | null>(null);
  const mounted = useRef(false);
  const send = useCallback(async (message: GitMessage): Promise<boolean> => {
    if (working.current) {
      if (message.type === 'GIT_CANCEL_SYNC') { queued.current = message; setPaused(true); }
      return false;
    }
    working.current = true; setBusy(true); setError(''); setPaused(false);
    let ok = true;
    try {
      const reply = await request(message);
      if (!reply.ok || !('kind' in reply.value) || reply.value.kind !== 'git') throw new Error('Git 状态响应无效。');
      if (mounted.current) setState(reply.value);
    } catch (reason: unknown) {
      ok = false;
      if (mounted.current) {
        if (message.type !== 'GIT_READ') setError(reason instanceof Error ? reason.message : 'Git 操作失败。');
        setPaused(true);
      }
      // Initial reads are silent; recover local state only after a failed operation.
      if (message.type !== 'GIT_READ') try {
        const reply = await request({ type: 'GIT_READ' });
        if (mounted.current && reply.ok && 'kind' in reply.value && reply.value.kind === 'git') setState(reply.value);
      } catch { /* Keep the last visible state until the user retries. */ }
    } finally {
      working.current = false;
      if (mounted.current) {
        setBusy(false);
        if (message.type === 'GIT_READ') setLoading(false);
        if (MUTATES_LIBRARY.has(message.type)) setRevision(value => value + 1);
        const next = queued.current; queued.current = null;
        if (next) void send(next);
      }
    }
    return ok;
  }, []);
  useEffect(() => { mounted.current = true; void send({ type: 'GIT_READ' }); return () => { mounted.current = false; }; }, [send]);
  useEffect(() => {
    if (!state || busy || paused) return;
    const running = state.accounts.find(item => item.sync?.state === 'running');
    if (!running) return;
    const timer = window.setTimeout(() => void send({ type: 'GIT_STEP', accountId: running.account.accountId }), 250);
    return () => window.clearTimeout(timer);
  }, [state, busy, paused, send]);
  // 分类增删改与账号变化都要让收藏页重新读取本地数据；同步分页不必触发重载。
  const refreshKey = (state?.accounts.map(item => item.account.accountId + ':' + (item.account.lastSyncedAt ?? '')).join('|') ?? '') + '#' + revision;
  const clearError = useCallback(() => setError(''), []);
  return { state, busy, loading, error, clearError, send, refreshKey };
}
export type GitController = ReturnType<typeof useGit>;
