'use client'

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { type Locale, t as tBase, tList as tListBase } from './i18n'

export type { Locale }

const STORAGE_KEY = 'jumix-marketing-locale'

const VALID_LOCALES: readonly Locale[] = ['ru', 'kz', 'en']

function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (VALID_LOCALES as readonly string[]).includes(v)
}

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  hydrated: boolean
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

/**
 * Marketing-only locale store. Persist в localStorage (`jumix-marketing-locale`).
 * Default 'ru'. SSR/первый CSR-render — всегда 'ru' до hydration (избегаем flash).
 * Не пересекается с админ-кабинетом — он пока locale-agnostic.
 */
export function MarketingLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ru')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (isLocale(stored)) setLocaleState(stored)
    } catch {
      // localStorage недоступен (private mode/disabled) — fallback на 'ru'
    }
    setHydrated(true)
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
      document.documentElement.lang = next === 'kz' ? 'kk' : next
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo(() => ({ locale, setLocale, hydrated }), [locale, setLocale, hydrated])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    // Fallback для случая когда хук вызван вне Provider (тесты, server snapshot).
    return { locale: 'ru', setLocale: () => {}, hydrated: false }
  }
  return ctx
}

/** Bound `t()` для текущей locale из контекста. */
export function useT() {
  const { locale } = useLocale()
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => tBase(key, vars, locale),
    [locale],
  )
}

/** Bound `tList<T>()` для текущей locale. */
export function useTList<T>() {
  const { locale } = useLocale()
  return useCallback((key: string) => tListBase<T>(key, locale), [locale])
}
