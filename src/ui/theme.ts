import type { Appearance } from '../data/types';

export function resolveColorMode(mode: Appearance['mode'], systemDark: boolean): 'light' | 'dark' {
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
}

export function applyAppearance(appearance: Appearance): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    document.documentElement.dataset.theme = appearance.theme;
    document.documentElement.dataset.mode = resolveColorMode(appearance.mode, media.matches);
    document.documentElement.style.colorScheme = resolveColorMode(appearance.mode, media.matches);
  };
  apply();
  media.addEventListener('change', apply);
  return () => media.removeEventListener('change', apply);
}
