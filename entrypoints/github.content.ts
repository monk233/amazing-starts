import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { repositoryFromUrl } from '../src/messaging';

export default defineContentScript({
  matches: ['https://github.com/*'],
  runAt: 'document_idle',
  main() {
    // M1 only establishes the isolated messaging boundary. No clicks, Stars, or account data are changed.
    void browser.runtime.sendMessage({
      type: 'CONTENT_READY', repository: repositoryFromUrl(location.href),
    }).catch(() => undefined);
  },
});
