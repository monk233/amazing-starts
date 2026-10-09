import { describe, expect, it } from 'vitest';
import { CredentialVault } from '../../src/data/credentials';
import { restrictStorage } from '../../src/data/storage';
import { MemoryStorage } from '../helpers/storage';

const setup = () => {
  const local = new MemoryStorage(); const session = new MemoryStorage();
  return { local, session, vault: new CredentialVault(local, session) };
};

describe('凭证存储边界', () => {
  it('restricts both storage areas to trusted contexts', async () => {
    const { local, session } = setup();
    await restrictStorage(local, session);
    expect(local.accessLevel).toBe('TRUSTED_CONTEXTS');
    expect(session.accessLevel).toBe('TRUSTED_CONTEXTS');
  });
  it('stores credentials only in session by default', async () => {
    const { local, session, vault } = setup();
    await vault.save('a', 'github', 'fake-token');
    expect(Object.keys(local.items)).toHaveLength(0);
    expect(Object.keys(session.items)).toHaveLength(1);
    expect(await vault.read('a', 'github')).toBe('fake-token');
    expect(await vault.read('b', 'github')).toBeNull();
    expect(await vault.read('a', 'ai')).toBeNull();
  });
  it('removes durable credentials when switching back to session-only', async () => {
    const { local, vault } = setup();
    await vault.save('a', 'ai', 'old-test-key', true);
    await vault.save('a', 'ai', 'new-test-key');
    expect(local.items).toEqual({});
    expect(await vault.read('a', 'ai')).toBe('new-test-key');
  });
  it('serializes concurrent writes without leaving an older credential behind', async () => {
    const { local, vault } = setup();
    await Promise.all([vault.save('a', 'ai', 'old', true), vault.save('a', 'ai', 'new')]);
    expect(local.items).toEqual({});
    expect(await vault.read('a', 'ai')).toBe('new');
  });
  it('forgets only the requested account and credential kind', async () => {
    const { vault } = setup();
    await vault.save('a', 'github', 'first'); await vault.save('b', 'github', 'second');
    await vault.forget('a', 'github');
    expect(await vault.read('a', 'github')).toBeNull();
    expect(await vault.read('b', 'github')).toBe('second');
  });
  it('a rejected write does not block later valid writes', async () => {
    const { vault } = setup();
    await expect(vault.save('a', 'ai', '')).rejects.toThrow();
    await vault.save('a', 'ai', 'valid-test-value');
    expect(await vault.read('a', 'ai')).toBe('valid-test-value');
  });
});
