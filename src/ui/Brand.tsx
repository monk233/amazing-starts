export function StarMark({ size = 25 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M16 3.5 19.5 12.5 28.5 16 19.5 19.5 16 28.5 12.5 19.5 3.5 16 12.5 12.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <circle cx="16" cy="16" r="3" fill="currentColor" />
  </svg>;
}
export function Brand() {
  return <span className="brand"><StarMark /><span>Amazing Starts</span></span>;
}
