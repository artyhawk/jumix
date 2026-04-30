import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY } from './persist'
import { ThemeProvider, useTheme } from './theme-provider'

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb)
    }),
    removeEventListener: vi.fn((_event: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb)
    }),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList & { __dispatchChange: (matches: boolean) => void }
  ;(mql as unknown as { __dispatchChange: (matches: boolean) => void }).__dispatchChange = (
    next: boolean,
  ) => {
    ;(mql as unknown as { matches: boolean }).matches = next
    for (const cb of listeners) {
      cb({ matches: next } as MediaQueryListEvent)
    }
  }
  vi.spyOn(window, 'matchMedia').mockReturnValue(mql)
  return mql
}

function ThemeProbe() {
  const { mode, theme, setMode, hydrated } = useTheme()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="theme">{theme}</span>
      <span data-testid="hydrated">{String(hydrated)}</span>
      <button type="button" onClick={() => setMode('dark')}>
        to-dark
      </button>
      <button type="button" onClick={() => setMode('light')}>
        to-light
      </button>
      <button type="button" onClick={() => setMode('system')}>
        to-system
      </button>
    </div>
  )
}

describe('ThemeProvider (B3-THEME)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.className = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("initial mode = 'system' when storage empty; resolves к light по умолчанию", async () => {
    mockMatchMedia(false)
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(await screen.findByTestId('hydrated')).toHaveTextContent('true')
    expect(screen.getByTestId('mode')).toHaveTextContent('system')
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
  })

  it("initial mode = 'system' resolves к dark when prefers-color-scheme: dark", async () => {
    mockMatchMedia(true)
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(await screen.findByTestId('hydrated')).toHaveTextContent('true')
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
  })

  it('подхватывает explicit mode из localStorage', async () => {
    mockMatchMedia(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(await screen.findByTestId('hydrated')).toHaveTextContent('true')
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('setMode("dark") обновляет state, persist и применяет class', async () => {
    mockMatchMedia(false)
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    await screen.findByTestId('hydrated')

    await userEvent.click(screen.getByText('to-dark'))
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('cycle light → dark → system применяет classes consistently', async () => {
    mockMatchMedia(false)
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    await screen.findByTestId('hydrated')

    await userEvent.click(screen.getByText('to-light'))
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
    await userEvent.click(screen.getByText('to-dark'))
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    await userEvent.click(screen.getByText('to-system'))
    // system + matches:false → light
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
    expect(screen.getByTestId('mode')).toHaveTextContent('system')
  })

  it("при mode='system' реагирует на смену OS preference", async () => {
    const mql = mockMatchMedia(false)
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    await screen.findByTestId('hydrated')
    expect(screen.getByTestId('theme')).toHaveTextContent('light')

    // Симулируем переключение OS на dark
    await act(async () => {
      ;(mql as unknown as { __dispatchChange: (m: boolean) => void }).__dispatchChange(true)
    })
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
  })

  it("при mode='dark' игнорирует OS preference change (explicit override)", async () => {
    const mql = mockMatchMedia(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    await screen.findByTestId('hydrated')

    await act(async () => {
      ;(mql as unknown as { __dispatchChange: (m: boolean) => void }).__dispatchChange(false)
    })
    // Mode остался dark, theme resolved тоже dark.
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('useTheme вне Provider возвращает безопасный default', () => {
    render(<ThemeProbe />)
    expect(screen.getByTestId('mode')).toHaveTextContent('system')
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(screen.getByTestId('hydrated')).toHaveTextContent('false')
  })
})
