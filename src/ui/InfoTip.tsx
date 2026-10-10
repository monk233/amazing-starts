import { useId, useState, type ReactNode } from 'react';
import { WorkspaceIcon } from './WorkspaceIcon';

/**
 * Small info affordance for guidance that used to be a paragraph: hover, focus or click reveals it.
 * The text stays in the DOM as a tooltip so keyboard and screen reader users can reach it.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <span className="info-tip"
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className="info-tip-trigger" aria-label={label}
      aria-describedby={open ? id : undefined}
      onClick={() => setOpen(value => !value)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <WorkspaceIcon name="info" />
    </button>
    {open && <span role="tooltip" id={id} className="info-tip-bubble">{children}</span>}
  </span>;
}
