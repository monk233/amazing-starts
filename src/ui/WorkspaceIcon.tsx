import type { ReactNode } from 'react';
const shapes: Record<string, ReactNode> = {
  chevron: <path d="m7 10 5 5 5-5"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4"/><circle cx="8" cy="6" r="2" fill="var(--paper)"/></>,
  folder: <path d="M3 7V5h7l2 2h9v13H3Z"/>,
  collection: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 9v11"/></>,
  repository: <path d="M5 3h12a2 2 0 0 1 2 2v16H7a3 3 0 0 1 0-6h12M5 3v15M9 7h6"/>,
  settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--rail)"/><circle cx="15" cy="17" r="3" fill="var(--rail)"/></>,
  branch: <><path d="M7 6v11M7 10c0 4 10 0 10 5"/><circle cx="7" cy="4" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="17" r="2"/></>,
  search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
  arrow: <path d="m9 6 6 6-6 6"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"/></>,
  external: <><path d="M14 3h7v7m0-7L10 14M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/></>,
};
export function WorkspaceIcon({ name }: { name: keyof typeof shapes }) {
  return <svg className="workspace-icon" viewBox="0 0 24 24" aria-hidden="true">{shapes[name]}</svg>;
}
export function WorkspaceArt() {
  return <div className="quiet-art" aria-hidden="true"><svg viewBox="0 0 140 90">
    <g className="folio-lines"><path d="M19 24h32l15 9 15-9h32v45H81l-15 9-15-9H19Z"/><path d="M66 33v45M28 34h20M28 43h23M28 52h18M83 35h20M83 44h20M83 53h14"/><path d="m116 9 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"/></g>
    <g className="orbital"><ellipse cx="73" cy="45" rx="54" ry="21" transform="rotate(-25 73 45)"/><ellipse cx="73" cy="45" rx="20" ry="35" transform="rotate(-25 73 45)"/><circle cx="73" cy="45" r="5" fill="currentColor"/><circle cx="24" cy="65" r="4" fill="var(--paper)"/><circle cx="94" cy="21" r="3" fill="currentColor"/></g>
  </svg></div>;
}
