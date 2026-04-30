import { ThemeProvider } from '@/lib/theme/theme-provider'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './theme-toggle'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.className = ''
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
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ThemeToggle (B3-THEME)', () => {
  it('renders с aria-label "Включить тёмную тему" когда сейчас light', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    expect(await screen.findByRole('button', { name: 'Включить тёмную тему' })).toBeInTheDocument()
  })

  it('renders с aria-label "Включить светлую тему" когда сейчас dark', async () => {
    window.localStorage.setItem('jumix-theme-mode', 'dark')
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    expect(await screen.findByRole('button', { name: 'Включить светлую тему' })).toBeInTheDocument()
  })

  it('клик из light состояния → applies .theme-dark', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    const button = await screen.findByRole('button', { name: 'Включить тёмную тему' })
    await userEvent.click(button)
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    expect(window.localStorage.getItem('jumix-theme-mode')).toBe('dark')
  })

  it('клик из dark состояния → applies .theme-light', async () => {
    window.localStorage.setItem('jumix-theme-mode', 'dark')
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    const button = await screen.findByRole('button', { name: 'Включить светлую тему' })
    await userEvent.click(button)
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
    expect(window.localStorage.getItem('jumix-theme-mode')).toBe('light')
  })

  it('два клика подряд возвращают исходную тему (round-trip)', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    const button = await screen.findByRole('button')
    await userEvent.click(button)
    expect(window.localStorage.getItem('jumix-theme-mode')).toBe('dark')
    await userEvent.click(button)
    expect(window.localStorage.getItem('jumix-theme-mode')).toBe('light')
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
  })
})
