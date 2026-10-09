import { describe, expect, it } from 'vitest';
import { authorizeMessage, repositoryFromUrl } from '../src/messaging';

const id = 'abcdefghijklmnopabcdefghijklmnop';
const ui = { id, url: `chrome-extension://${id}/manager.html` };
const content = { id, url: 'https://github.com/monk233/amazing-starts', tab: { id: 1 } };

describe('扩展消息信任边界', () => {
  it('allows the registered manager and popup pages', () => {
    expect(authorizeMessage({ type: 'GET_STATUS' }, ui, id)?.type).toBe('GET_STATUS');
    expect(authorizeMessage({ type: 'OPEN_MANAGER' }, { ...ui, url: `chrome-extension://${id}/popup.html` }, id)?.type).toBe('OPEN_MANAGER');
  });
  it('denies content-script access to settings and privileged operations', () => {
    for (const type of ['GET_STATUS', 'OPEN_MANAGER', 'READ_CREDENTIAL', 'FETCH']) {
      expect(authorizeMessage({ type }, content, id)).toBeNull();
    }
    expect(authorizeMessage({ type: 'SET_APPEARANCE', appearance: { theme: 'folio', mode: 'dark' } }, content, id)).toBeNull();
  });
  it('denies arbitrary request fields even on a valid UI request', () => {
    expect(authorizeMessage({ type: 'GET_STATUS', url: 'https://example.com' }, ui, id)).toBeNull();
  });
  it('requires the same extension ID and a known UI path', () => {
    expect(authorizeMessage({ type: 'GET_STATUS' }, { ...ui, id: 'other' }, id)).toBeNull();
    expect(authorizeMessage({ type: 'GET_STATUS' }, { ...ui, url: `chrome-extension://${id}/untrusted.html` }, id)).toBeNull();
  });
  it('allows only a repository hint matching the actual sender URL', () => {
    expect(authorizeMessage({ type: 'CONTENT_READY', repository: 'monk233/amazing-starts' }, content, id)?.type).toBe('CONTENT_READY');
    expect(authorizeMessage({ type: 'CONTENT_READY', repository: 'other/repository' }, content, id)).toBeNull();
    expect(authorizeMessage({ type: 'CONTENT_READY', repository: 'monk233/amazing-starts' }, { ...content, url: 'https://github.com.evil.test/monk233/amazing-starts' }, id)).toBeNull();
  });
  it('does not turn a web page into an extension page through its URL', () => {
    expect(authorizeMessage({ type: 'GET_STATUS' }, { ...content, url: 'https://github.com/manager.html' }, id)).toBeNull();
    expect(authorizeMessage({ type: 'GET_STATUS' }, { id, url: `chrome-extension://${id}.evil.test/manager.html` }, id)).toBeNull();
  });
});

describe('仓库线索解析', () => {
  it('recognizes a repository sub-page without treating it as authorization', () => {
    expect(repositoryFromUrl('https://github.com/monk233/amazing-starts/issues')).toBe('monk233/amazing-starts');
  });
  it.each(['https://github.com/settings/profile', 'http://github.com/a/b', 'https://github.com:8443/a/b', 'https://github.com.evil.test/a/b', 'https://github.com/a/%3Cscript%3E', 'not a url'])('rejects %s', url => {
    expect(repositoryFromUrl(url)).toBeNull();
  });
});
