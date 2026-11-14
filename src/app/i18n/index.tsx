import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ar } from './ar';
import { en } from './en';

export type Language = 'ar' | 'en';
export type MessageKey = keyof typeof ar;

export const LANGUAGE_STORAGE_KEY = 'tibaeati.language';
const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { ar, en };

function readLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked (private mode); the choice then lasts for this session only.
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ language, setLanguage, t: (key) => DICTIONARIES[language][key] }),
    [language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

export function useT(): (key: MessageKey) => string {
  return useI18n().t;
}
