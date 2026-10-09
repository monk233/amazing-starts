import { describe, expect, it } from 'vitest';
import { resolveColorMode } from '../src/ui/theme';

describe('跟随系统与手动明暗设置', () => {
  it('follows a dark system', () => expect(resolveColorMode('system', true)).toBe('dark'));
  it('follows a light system', () => expect(resolveColorMode('system', false)).toBe('light'));
  it('preserves explicit light mode', () => expect(resolveColorMode('light', true)).toBe('light'));
  it('preserves explicit dark mode', () => expect(resolveColorMode('dark', false)).toBe('dark'));
});
