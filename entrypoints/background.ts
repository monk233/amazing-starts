import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { openDatabase } from '../src/data/database';
import { SettingsStore } from '../src/data/settings';
import { restrictStorage } from '../src/data/storage';
import { authorizeMessage, type Reply, type Status } from '../src/messaging';

export default defineBackground(() => {
  const settings = new SettingsStore(browser.storage.local);
  let ready: Promise<void> | undefined;
  function initialize(): Promise<void> {
    ready ??= (async () => {
      await restrictStorage(browser.storage.local, browser.storage.session);
      const database = await openDatabase();
      database.close();
    })().catch((error: unknown) => { ready = undefined; throw error; });
    return ready;
  }

  // Register synchronously so wake-up messages cannot be lost while storage initializes.
  browser.runtime.onMessage.addListener((input: unknown, sender, sendResponse) => {
    const message = authorizeMessage(input, sender, browser.runtime.id);
    if (!message) {
      sendResponse({ ok: false, error: '消息来源或内容不受信任。' } satisfies Reply);
      return false;
    }
    void (async (): Promise<Reply> => {
      await initialize();
      if (message.type === 'CONTENT_READY') return { ok: true, value: { acknowledged: true } };
      if (message.type === 'OPEN_MANAGER') {
        await browser.tabs.create({ url: browser.runtime.getURL('/manager.html') });
        return { ok: true, value: { acknowledged: true } };
      }
      if (message.type === 'SET_APPEARANCE') return { ok: true, value: await settings.setAppearance(message.appearance) };
      const status: Status = {
        phase: 'foundation', github: 'not_implemented', ai: 'not_implemented',
        settings: await settings.read(), database: 'ready',
      };
      return { ok: true, value: status };
    })().then(sendResponse).catch(() => {
      sendResponse({ ok: false, error: '本地初始化或操作失败。请重新打开扩展；原数据未被清除。' } satisfies Reply);
    });
    return true;
  });
});
