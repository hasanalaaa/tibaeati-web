import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

const TOAST_MS = 5_000;

interface ToastApi {
  show: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({
  children,
  dismissLabel,
}: {
  children: ReactNode;
  dismissLabel: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((text: string) => {
    setMessage(text);
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, TOAST_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [message]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4"
      >
        {message === null ? null : (
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg bg-fg px-4 py-2 text-bg shadow-lg">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => {
                setMessage(null);
              }}
              className="focus-ring min-h-11 min-w-11 cursor-pointer rounded-md bg-transparent px-2 font-semibold text-bg underline"
            >
              {dismissLabel}
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}
