import { describe, expect, it } from 'vitest'
import { ThemeScript, __THEME_SCRIPT_BODY } from './theme-script'

describe('ThemeScript (B3-THEME)', () => {
  it('inline script содержит корректный storage key', () => {
    expect(__THEME_SCRIPT_BODY).toContain("'jumix-theme-mode'")
  })

  it('script проверяет prefers-color-scheme matchMedia', () => {
    expect(__THEME_SCRIPT_BODY).toContain('prefers-color-scheme: dark')
    expect(__THEME_SCRIPT_BODY).toContain('matchMedia')
  })

  it('script ставит class theme-light/theme-dark на documentElement', () => {
    expect(__THEME_SCRIPT_BODY).toContain('theme-light')
    expect(__THEME_SCRIPT_BODY).toContain('theme-dark')
    expect(__THEME_SCRIPT_BODY).toContain('classList.add')
  })

  it('script wrapped в IIFE и валидирует stored value', () => {
    expect(__THEME_SCRIPT_BODY).toMatch(/^\(function\(\) \{/)
    expect(__THEME_SCRIPT_BODY).toContain("'light'")
    expect(__THEME_SCRIPT_BODY).toContain("'dark'")
    expect(__THEME_SCRIPT_BODY).toContain("'system'")
  })

  it('при выполнении в jsdom применяет theme-light по умолчанию (no storage)', () => {
    document.documentElement.className = ''
    window.localStorage.clear()
    // Используем new Function вместо eval — изолированный scope, без access
    // к локальным переменным теста (закрывает biome lint/security/noGlobalEval).
    new Function(__THEME_SCRIPT_BODY)()
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
  })

  it("при выполнении с stored 'dark' применяет theme-dark", () => {
    document.documentElement.className = ''
    window.localStorage.setItem('jumix-theme-mode', 'dark')
    new Function(__THEME_SCRIPT_BODY)()
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    window.localStorage.clear()
  })

  it('ThemeScript renders <script> тэг с inline content', () => {
    const out = ThemeScript()
    expect(out.type).toBe('script')
    expect(
      (out.props as { dangerouslySetInnerHTML: { __html: string } }).dangerouslySetInnerHTML,
    ).toBeDefined()
  })
})
