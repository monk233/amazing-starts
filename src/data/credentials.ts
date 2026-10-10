import type { StorageArea } from './storage';

type Kind = 'github' | 'gitee' | 'ai';

export class CredentialVault {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly local: StorageArea, private readonly session: StorageArea) {}

  private key(accountId: string, kind: Kind): string {
    if (!/^[A-Za-z0-9_=:-]{1,180}$/.test(accountId)) throw new Error('无效的凭证账号。');
    return `credential:${accountId}:${kind}`;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.tail.then(operation);
    this.tail = task.catch(() => undefined);
    return task;
  }

  save(accountId: string, kind: Kind, secret: string, remember = false): Promise<void> {
    return this.serialize(async () => {
      const key = this.key(accountId, kind);
      if (!secret.trim() || secret.length > 16_384) throw new Error('凭证不能为空或超过允许长度。');
      // Remove both locations first: choosing session storage must never leave an old durable copy.
      await this.local.remove(key);
      await this.session.remove(key);
      await (remember ? this.local : this.session).set({ [key]: secret });
    });
  }

  read(accountId: string, kind: Kind): Promise<string | null> {
    return this.serialize(async () => {
      const key = this.key(accountId, kind);
      const temporary = (await this.session.get(key))[key];
      const value = temporary ?? (await this.local.get(key))[key];
      if (value === undefined) return null;
      if (typeof value !== 'string') throw new Error('凭证数据格式无效。');
      return value;
    });
  }

  forget(accountId: string, kind: Kind): Promise<void> {
    return this.serialize(async () => {
      const key = this.key(accountId, kind);
      await Promise.all([this.local.remove(key), this.session.remove(key)]);
    });
  }
}
