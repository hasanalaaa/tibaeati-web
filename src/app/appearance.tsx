import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Appearance = 'system' | 'light' | 'dark';

export const APPEARANCE_STORAGE_KEY = 'tibaeati.appearance';

function readAppearance(): Appearance {
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

interface AppearanceValue {
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
}

const AppearanceContext = createContext<AppearanceValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>(readAppearance);

  // 'system' removes the attribute so the prefers-color-scheme media query in tokens.css decides.
  useEffect(() => {
    const root = document.documentElement;
    if (appearance === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', appearance);
  }, [appearance]);

  const setAppearance = useCallback((next: Appearance) => {
    setAppearanceState(next);
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked (private mode); the choice then lasts for this session only.
    }
  }, []);

  const value = useMemo(() => ({ appearance, setAppearance }), [appearance, setAppearance]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider');
  return value;
}
