import { browser } from 'wxt/browser';
import type { Reply, UiMessage } from '../messaging';

export async function request(message: UiMessage): Promise<Reply> {
  if (!browser.runtime?.id) throw new Error('请从已加载的 Chrome 扩展中打开此页面。');
  const reply = await browser.runtime.sendMessage(message) as Reply | undefined;
  if (!reply || typeof reply.ok !== 'boolean') throw new Error('后台未返回有效响应，请重新打开扩展。');
  if (!reply.ok) throw new Error(reply.error);
  return reply;
}
