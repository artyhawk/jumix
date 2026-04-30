import type { ThemeMode } from '@/lib/api/types'
import { isThemeMode } from '@jumix/shared'

/**
 * localStorage помойка для theme preference (B3-THEME).
 *
 * Anonymous users persist'ят выбор только тут. Logged-in — здесь + в БД через
 * PATCH /me/preferences (см. use-theme-sync.ts). Ключ shared между anon и
 * logged-in: при login client сравнивает localStorage vs DB и решает какой
 * winner (см. ADR 0009).
 */

export const THEME_STORAGE_KEY = 'jumix-theme-mode'

export function readStoredThemeMode(): ThemeMode | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeStoredThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // private mode / quota exceeded — silently fail
  }
}

/** Резолвит mode → конкретный 'light' | 'dark' через `prefers-color-scheme`. */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Применяет theme class на <html>. Идемпотентна (replace existing). */
export function applyThemeClass(theme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('theme-light', 'theme-dark')
  root.classList.add(`theme-${theme}`)
}
