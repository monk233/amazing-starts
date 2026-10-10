import { GitService } from '../src/git/service';
import { GitError, gitMessage } from '../src/git/types';
import { readLibrary } from '../src/library/library';
import { AiService } from '../src/ai/service';
import { AiError } from '../src/ai/config';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { openDatabase } from '../src/data/database';
import { SettingsStore } from '../src/data/settings';
import { restrictStorage } from '../src/data/storage';
import { authorizeMessage, type Reply, type Status } from '../src/messaging';

export default defineBackground(() => {
  const settings = new SettingsStore(browser.storage.local);
  const ai = new AiService(browser.storage.local, browser.storage.session, origin => browser.permissions.contains({ origins: [origin] }));
  const git = new GitService(browser.storage.local, browser.storage.session);
  let ready: Promise<void> | undefined;
  function initialize(): Promise<void> {
    ready ??= (async () => {
      await restrictStorage(browser.storage.local, browser.storage.session);
      const database = await openDatabase();
      database.close();
    })().catch((error: unknown) => { ready = undefined; throw error; });
    return ready;
  }

  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL('/manager.html') });
  });

  // Register synchronously so wake-up messages cannot be lost while storage initializes.
  browser.runtime.onMessage.addListener((input: unknown, sender, sendResponse) => {
    const message = authorizeMessage(input, sender, browser.runtime.id);
    if (!message) {
      sendResponse({ ok: false, error: '消息来源或内容不受信任。' } satisfies Reply);
      return false;
    }
    void (async (): Promise<Reply> => {
      await initialize();
      const gitRequest = gitMessage(message);
      if (gitRequest) return { ok: true, value: await git.handle(gitRequest) };
      if (message.type === 'CONTENT_READY') return { ok: true, value: { acknowledged: true } };
      if (message.type === 'OPEN_MANAGER') {
        await browser.tabs.create({ url: browser.runtime.getURL('/manager.html') });
        return { ok: true, value: { acknowledged: true } };
      }
      if (message.type === 'SET_APPEARANCE') return { ok: true, value: await settings.setAppearance(message.appearance) };
      if (message.type === 'LIBRARY_READ') {
        const database = await openDatabase();
        try { return { ok: true, value: await readLibrary(database, message.accountId) }; }
        finally { database.close(); }
      }
      if (message.type === 'AI_READ') return { ok: true, value: await ai.read() };
      if (message.type === 'AI_SAVE') return { ok: true, value: await ai.save(message.config) };
      if (message.type === 'AI_MODELS' || message.type === 'AI_TEST') {
        const models = await ai.models(message.baseUrl);
        return { ok: true, value: message.type === 'AI_MODELS' ? { models } : { modelCount: models.length } };
      }
      const status: Status = {
        phase: 'github', github: 'access_token', ai: 'configuration',
        settings: await settings.read(), database: 'ready',
      };
      return { ok: true, value: status };
    })().then(sendResponse).catch((error: unknown) => {
      if (error instanceof GitError || error instanceof AiError) { sendResponse({ ok: false, error: error.message } satisfies Reply); return; }
      sendResponse({ ok: false, error: '本地初始化或操作失败。请重新打开扩展；原数据未被清除。' } satisfies Reply);
    });
    return true;
  });
});
