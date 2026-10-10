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

describe('AI 设置专用消息', () => {
  const config = { baseUrl: 'https://provider.example/v1', apiKey: 'secret-test-key', model: '', remember: false };
  const messages = [{ type: 'AI_READ' }, { type: 'AI_SAVE', config }, { type: 'AI_TEST', baseUrl: config.baseUrl }, { type: 'AI_MODELS', baseUrl: config.baseUrl }];
  it('allows AI operations only on the manager page', () => {
    for (const message of messages) {
      expect(authorizeMessage(message, ui, id)?.type).toBe(message.type);
      expect(authorizeMessage(message, content, id)).toBeNull();
      expect(authorizeMessage(message, { ...ui, url: `chrome-extension://${id}/popup.html` }, id)).toBeNull();
      expect(authorizeMessage({ ...message, url: 'https://evil.example' }, ui, id)).toBeNull();
    }
  });
  it('does not add an arbitrary request or credential-reading interface', () => {
    expect(authorizeMessage({ type: 'AI_MODELS' }, ui, id)).toBeNull();
    expect(authorizeMessage({ type: 'AI_SAVE', config: { ...config, headers: {} } }, ui, id)).toBeNull();
    expect(authorizeMessage({ type: 'READ_CREDENTIAL' }, ui, id)).toBeNull();
  });
});


describe('收藏管理页消息', () => {
  it('allows bounded local reads only from the manager', () => {
    for (const accountId of [null, 'account-a']) {
      const message = { type: 'LIBRARY_READ', accountId };
      expect(authorizeMessage(message, ui, id)).toEqual(message);
      expect(authorizeMessage(message, content, id)).toBeNull();
      expect(authorizeMessage(message, { ...ui, url: 'chrome-extension://' + id + '/popup.html' }, id)).toBeNull();
      expect(authorizeMessage({ ...message, table: 'credentials' }, ui, id)).toBeNull();
    }
  });
  it('rejects missing, invalid and oversized account identifiers', () => {
    for (const accountId of [undefined, '', ' ', 7, {}, 'a'.repeat(257)]) expect(authorizeMessage({ type: 'LIBRARY_READ', accountId }, ui, id)).toBeNull();
  });
});

describe('GitHub privileged messages', () => {
  it('accepts GitHub reads and validation from the settings hash route', () => {
    const extensionId = 'epmelnmjmhfabpcllnpjmmhflbbnnkfm';
    const sender = { id: extensionId, url: `chrome-extension://${extensionId}/manager.html#settings` };
    for (const message of [{ type: 'GITHUB_READ' }, { type: 'GITHUB_CONNECT', token: 'test_personal_access_token_123', remember: false }]) {
      expect(authorizeMessage(message, sender, extensionId)).toEqual(message);
      expect(authorizeMessage(message, { ...sender, id: 'another-extension' }, extensionId)).toBeNull();
    }
  });
  it('allows bounded commands only from the manager', () => {
    for (const message of [{ type: 'GITHUB_READ' },
      { type: 'GITHUB_CONNECT', token: 'test_personal_access_token_123', remember: false },
      ...['GITHUB_SYNC', 'GITHUB_STEP', 'GITHUB_CANCEL_SYNC', 'GITHUB_DISCONNECT'].map(type => ({ type, accountId: 'U_a' }))]) {
      expect(authorizeMessage(message, ui, id)).toEqual(message);
      expect(authorizeMessage(message, content, id)).toBeNull();
      expect(authorizeMessage(message, { ...ui, url: `chrome-extension://${id}/popup.html` }, id)).toBeNull();
      expect(authorizeMessage({ ...message, secret: 'injected-token' }, ui, id)).toBeNull();
      expect(authorizeMessage({ ...message, url: 'https://evil.test' }, ui, id)).toBeNull();
    }
  });
  it('rejects credential reads, obsolete OAuth commands and arbitrary fields', () => {
    for (const message of [{ type: 'GITHUB_TOKEN' }, { type: 'GITHUB_LOGIN', clientId: 'project-client-id', remember: false },
      { type: 'GITHUB_POLL' }, { type: 'GITHUB_CANCEL_LOGIN' },
      { type: 'GITHUB_CONNECT', token: 'test_personal_access_token_123', remember: false, scope: 'repo' },
      { type: 'GITHUB_SYNC', accountId: '../../other-account' }, { type: 'GITHUB_STEP' }]) expect(authorizeMessage(message, ui, id)).toBeNull();
  });
  it.each(['', 'short', 'a'.repeat(1025), 'test_token_with\r\nheader', 'test_token_with spaces', 7, null])('rejects invalid tokens at the message boundary', token => {
    expect(authorizeMessage({ type: 'GITHUB_CONNECT', token, remember: false }, ui, id)).toBeNull();
  });
});
