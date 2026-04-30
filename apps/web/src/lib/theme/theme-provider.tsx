'use client'

import type { ThemeMode } from '@/lib/api/types'
import { THEME_MODE_DEFAULT } from '@jumix/shared'
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { applyThemeClass, readStoredThemeMode, resolveTheme, writeStoredThemeMode } from './persist'

/**
 * Theme provider (B3-THEME).
 *
 * Single source of truth для текущей темы:
 *   - `mode` — user preference: 'light' | 'dark' | 'system'
 *   - `theme` — resolved: 'light' | 'dark'
 *
 * Resolution: если mode='system' → читаем `prefers-color-scheme` через
 * matchMedia (live: реагируем на смену OS-настройки). Иначе — mode === theme.
 *
 * Provider mount'ится один раз в root layout. Inline ThemeScript уже
 * успевает поставить class на <html> до hydrate (FOUC prevention), поэтому
 * useState initializer'у достаточно прочитать localStorage без перерасчёта
 * applyThemeClass на первом mount.
 */

export type Theme = 'light' | 'dark'

interface ThemeContextValue {
  /** User-facing preference. */
  mode: ThemeMode
  /** Resolved current theme (after system-resolution). */
  theme: Theme
  /** Update preference. Provider apply'ит class к <html> + persist'ит в localStorage. */
  setMode: (mode: ThemeMode) => void
  /** True после первого client-side useEffect (mount). До этого — SSR-default. */
  hydrated: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR-render: всегда default. Inline ThemeScript уже поставил правильный
  // class на <html> через localStorage — react hydrate просто не трогает class.
  // На первом client useEffect синхронизируем state со storage.
  const [mode, setModeState] = useState<ThemeMode>(THEME_MODE_DEFAULT)
  const [theme, setThemeState] = useState<Theme>('light')
  const [hydrated, setHydrated] = useState(false)

  // Mount: подтягиваем initial state из localStorage и резолвим тему.
  useEffect(() => {
    const stored = readStoredThemeMode() ?? THEME_MODE_DEFAULT
    const resolved = resolveTheme(stored)
    setModeState(stored)
    setThemeState(resolved)
    applyThemeClass(resolved)
    setHydrated(true)
  }, [])

  // System preference listener — активен ТОЛЬКО в mode='system'.
  useEffect(() => {
    if (mode !== 'system') return
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const next: Theme = mq.matches ? 'dark' : 'light'
      setThemeState(next)
      applyThemeClass(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    const resolved = resolveTheme(next)
    setModeState(next)
    setThemeState(resolved)
    applyThemeClass(resolved)
    writeStoredThemeMode(next)
  }, [])

  const value = useMemo(
    () => ({ mode, theme, setMode, hydrated }),
    [mode, theme, setMode, hydrated],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    // Fallback для случая когда хук вызван вне Provider (старт unit-тестов
    // что не оборачивают, или server-render fragment'а вне layout-tree).
    return { mode: THEME_MODE_DEFAULT, theme: 'light', setMode: () => {}, hydrated: false }
  }
  return ctx
}
