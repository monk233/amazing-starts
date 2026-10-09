import { isAppearance } from './data/settings';
import type { Appearance, Settings } from './data/types';

export interface Sender { id?: string; url?: string; tab?: unknown }
export type ContentMessage = { type: 'CONTENT_READY'; repository: string | null };
export type UiMessage = { type: 'GET_STATUS' } | { type: 'OPEN_MANAGER' } |
  { type: 'SET_APPEARANCE'; appearance: Appearance };
export type Message = ContentMessage | UiMessage;
export interface Status {
  phase: 'foundation'; github: 'not_implemented'; ai: 'not_implemented';
  settings: Settings; database: 'ready';
}
export type Reply = { ok: true; value: Status | Settings | { acknowledged: true } } |
  { ok: false; error: string };

const UI_PATHS = new Set(['/manager.html', '/popup.html']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function repositoryFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port) return null;
    const [owner, repository] = url.pathname.split('/').filter(Boolean);
    if (!owner || !repository || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner)) return null;
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repository) || repository === '.' || repository === '..') return null;
    if (['settings', 'features', 'marketplace', 'topics', 'collections', 'orgs', 'users', 'login', 'search', 'sponsors'].includes(owner)) return null;
    return `${owner}/${repository}`;
  } catch { return null; }
}

export function authorizeMessage(input: unknown, sender: Sender, extensionId: string): Message | null {
  if (sender.id !== extensionId || !sender.url || !isRecord(input)) return null;
  let url: URL;
  try { url = new URL(sender.url); } catch { return null; }
  const trustedUi = url.protocol === 'chrome-extension:' && url.hostname === extensionId && UI_PATHS.has(url.pathname);
  if (trustedUi) {
    if ((input.type === 'GET_STATUS' || input.type === 'OPEN_MANAGER') && Object.keys(input).length === 1) return input as UiMessage;
    if (input.type === 'SET_APPEARANCE' && Object.keys(input).length === 2 && isAppearance(input.appearance)) {
      return { type: input.type, appearance: input.appearance };
    }
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || sender.tab === undefined) return null;
  if (input.type !== 'CONTENT_READY' || Object.keys(input).length !== 2) return null;
  const expected = repositoryFromUrl(sender.url);
  if (input.repository !== expected) return null;
  return { type: 'CONTENT_READY', repository: expected };
}
