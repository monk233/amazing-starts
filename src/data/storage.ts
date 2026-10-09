export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string | string[]): Promise<void>;
  setAccessLevel(options: { accessLevel: 'TRUSTED_CONTEXTS' }): Promise<void>;
}

export async function restrictStorage(local: StorageArea, session: StorageArea): Promise<void> {
  await Promise.all([
    local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]);
}
