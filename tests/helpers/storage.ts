import type { StorageArea } from '../../src/data/storage';

export class MemoryStorage implements StorageArea {
  items: Record<string, unknown> = {};
  accessLevel: string | null = null;
  async get(key: string): Promise<Record<string, unknown>> { return key in this.items ? { [key]: structuredClone(this.items[key]) } : {}; }
  async set(items: Record<string, unknown>): Promise<void> { Object.assign(this.items, structuredClone(items)); }
  async remove(key: string | string[]): Promise<void> { for (const item of Array.isArray(key) ? key : [key]) delete this.items[item]; }
  async setAccessLevel(options: { accessLevel: 'TRUSTED_CONTEXTS' }): Promise<void> { this.accessLevel = options.accessLevel; }
}
