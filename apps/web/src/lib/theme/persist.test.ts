import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_STORAGE_KEY,
  applyThemeClass,
  readStoredThemeMode,
  resolveTheme,
  writeStoredThemeMode,
} from './persist'

describe('theme persist (B3-THEME)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.className = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('readStoredThemeMode returns null when storage empty', () => {
    expect(readStoredThemeMode()).toBeNull()
  })

  it('writeStoredThemeMode persists и читается обратно', () => {
    writeStoredThemeMode('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(readStoredThemeMode()).toBe('dark')
  })

  it('readStoredThemeMode returns null on garbage value (validation)', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'midnight')
    expect(readStoredThemeMode()).toBeNull()
  })

  it("resolveTheme('light') возвращает 'light' (no system check)", () => {
    expect(resolveTheme('light')).toBe('light')
  })

  it("resolveTheme('dark') возвращает 'dark' (no system check)", () => {
    expect(resolveTheme('dark')).toBe('dark')
  })

  it("resolveTheme('system') читает prefers-color-scheme — dark", () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    expect(resolveTheme('system')).toBe('dark')
  })

  it("resolveTheme('system') читает prefers-color-scheme — light", () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    expect(resolveTheme('system')).toBe('light')
  })

  it("applyThemeClass('dark') ставит .theme-dark на <html>", () => {
    applyThemeClass('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    expect(document.documentElement.classList.contains('theme-light')).toBe(false)
  })

  it("applyThemeClass('light') заменяет .theme-dark на .theme-light", () => {
    document.documentElement.classList.add('theme-dark')
    applyThemeClass('light')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false)
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
  })
})
