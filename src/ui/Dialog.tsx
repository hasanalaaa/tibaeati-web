import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons row at the end of the dialog. */
  actions?: ReactNode;
}

/** Native `<dialog>`: focus trap, Escape and inert background come from the browser. */
export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(92vw,28rem)] rounded-lg border border-border bg-surface p-0 text-fg shadow-lg backdrop:bg-black/40"
    >
      {open ? (
        <div className="p-5">
          <h2 id={titleId} className="mb-3 text-lg font-bold">
            {title}
          </h2>
          <div className="text-fg-muted">{children}</div>
          {actions ? <div className="mt-5 flex flex-wrap justify-end gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
