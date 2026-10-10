import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { WorkspaceIcon } from './WorkspaceIcon';

type Option = { value: string; label: string };

/** A compact single-value picker shared by navigation and library filters. */
export function SelectMenu({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex(option => option.value === value);
  const search = useRef({ text: '', time: 0 });
  useEffect(() => {
    if (!open) return;
    menu.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useEffect(() => { if (open) document.getElementById(id + '-' + active)?.scrollIntoView({ block: 'nearest' }); }, [active, open, id]);
  const show = () => { setActive(Math.max(0, selected)); setOpen(true); };
  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false); trigger.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); return; }
    let next = active;
    if (event.key === 'ArrowDown') next = Math.min(options.length - 1, active + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, active - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      search.current.text = (now - search.current.time < 700 ? search.current.text : '') + event.key.toLowerCase();
      search.current.time = now;
      const found = options.findIndex(option => option.label.toLowerCase().startsWith(search.current.text));
      if (found >= 0) next = found;
    } else return;
    event.preventDefault(); setActive(next);
  };
  return <div className="select-menu" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} className="select-trigger" type="button" aria-label={label + '：' + (options[selected]?.label ?? '')}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled || !options.length}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); }
      }}><span>{options[selected]?.label ?? label}</span><WorkspaceIcon name="chevron"/></button>
    {open && <div ref={menu} id={id} className="select-options" role="listbox" aria-label={label} tabIndex={-1}
      aria-activedescendant={id + '-' + active} onKeyDown={onKeyDown}>
      {options.map((option, index) => <button type="button" role="option" aria-selected={value === option.value}
        tabIndex={-1} id={id + '-' + index} key={option.value} className={active === index ? 'highlighted' : ''}
        onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
        <span>{option.label}</span>{value === option.value && <WorkspaceIcon name="check"/>}
      </button>)}
    </div>}
  </div>;
}
