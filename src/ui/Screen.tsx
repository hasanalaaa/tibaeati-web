import type { ReactNode } from 'react';
import { IconButton } from './IconButton';

export interface ScreenProps {
  title: string;
  /** When set, shows a start-side back button with this accessible label. */
  backLabel?: string;
  onBack?: () => void;
  /** Controls placed at the end of the top bar. */
  actions?: ReactNode;
  children: ReactNode;
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="rtl:-scale-x-100"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function Screen({ title, backLabel, onBack, actions, children }: ScreenProps) {
  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 border-b border-border bg-chrome pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex min-h-14 max-w-(--content-max) items-center gap-2 ps-[max(0.5rem,env(safe-area-inset-left))] pe-[max(0.5rem,env(safe-area-inset-right))]">
          {backLabel && onBack ? (
            <IconButton label={backLabel} onClick={onBack}>
              <BackIcon />
            </IconButton>
          ) : null}
          <h1 className="flex-1 truncate px-2 text-lg font-bold">{title}</h1>
          {actions}
        </div>
      </header>
      <main className="mx-auto max-w-(--content-max) py-5 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))]">
        {children}
      </main>
    </div>
  );
}
