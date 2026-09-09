'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { interfaceTraditionalChinese } from './zh-TW';

export type Locale = 'en' | 'zh-TW';
const storageKey = 'same-page.locale';
const listeners = new Set<() => void>();
let current: Locale = 'en';
function readLocale(): Locale {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'en' || saved === 'zh-TW') current = saved;
  } catch {
    /* Preferences still work when storage is unavailable. */
  }
  return current;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}
const LanguageContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
}>({ locale: 'en', setLocale: () => {} });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribe,
    readLocale,
    () => 'en' as const,
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  function setLocale(next: Locale) {
    current = next;
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* Device-local fallback. */
    }
    listeners.forEach((listener) => listener());
  }
  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  function t(text: string, values: (string | number | null)[] = []) {
    const translated =
      context.locale === 'zh-TW'
        ? (interfaceTraditionalChinese[text] ?? text)
        : text;
    return translated.replace(/\{(\d+)\}/g, (match, index) =>
      String(values[Number(index)] ?? match),
    );
  }
  return { ...context, t };
}
