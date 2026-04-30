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
  it('renders trigger с aria-label', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: 'Сменить тему' })).toBeInTheDocument()
  })

  it('opens dropdown с 3 опциями (Светлая / Тёмная / Системная)', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Сменить тему' }))
    expect(await screen.findByText('Светлая')).toBeInTheDocument()
    expect(screen.getByText('Тёмная')).toBeInTheDocument()
    expect(screen.getByText('Системная')).toBeInTheDocument()
  })

  it('клик по "Тёмная" применяет .theme-dark на <html>', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Сменить тему' }))
    await userEvent.click(await screen.findByText('Тёмная'))
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    expect(window.localStorage.getItem('jumix-theme-mode')).toBe('dark')
  })

  it('клик по "Светлая" применяет .theme-light', async () => {
    window.localStorage.setItem('jumix-theme-mode', 'dark')
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Сменить тему' }))
    await userEvent.click(await screen.findByText('Светлая'))
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
    expect(window.localStorage.getItem('jumix-theme-mode')).toBe('light')
  })
})
