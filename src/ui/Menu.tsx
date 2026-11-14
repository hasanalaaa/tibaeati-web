import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconButton } from './IconButton';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface MenuProps {
  /** Accessible name of the trigger button. */
  label: string;
  items: readonly MenuItem[];
  /** Trigger icon. */
  children: ReactNode;
}

export function Menu({ label, items, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const buttons = () =>
      Array.from(
        rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:enabled') ?? [],
      );
    buttons()[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const list = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:enabled') ?? [],
    );
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    list[(next + list.length) % list.length]?.focus();
    event.preventDefault();
  }

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        label={label}
        aria-haspopup="menu"
        onKeyDown={onKeyDown}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        {children}
      </IconButton>
      {open ? (
        <div
          id={listId}
          role="menu"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          aria-label={label}
          className="absolute end-0 top-full z-20 mt-1 min-w-48 rounded-md border border-border bg-surface p-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="focus-ring flex min-h-11 w-full cursor-pointer items-center rounded-sm bg-transparent px-3 text-start text-fg hover:bg-input disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
