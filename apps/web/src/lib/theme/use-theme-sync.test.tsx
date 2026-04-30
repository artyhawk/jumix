import { useAuthStore } from '@/lib/auth-store'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY } from './persist'
import { ThemeProvider, useTheme } from './theme-provider'
import { useThemeSync } from './use-theme-sync'

vi.mock('@/lib/api/preferences', () => ({
  updatePreferences: vi.fn(),
}))

import { updatePreferences } from '@/lib/api/preferences'
const mockedUpdate = vi.mocked(updatePreferences)

function mockMatchMedia(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList)
}

function SyncProbe({ onTheme }: { onTheme?: (theme: string) => void }) {
  useThemeSync()
  const { theme, mode, setMode } = useTheme()
  if (onTheme) onTheme(theme)
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setMode('dark')}>
        toggle-dark
      </button>
    </div>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.className = ''
  mockMatchMedia(false)
  mockedUpdate.mockReset()
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    user: null,
    hydrated: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useThemeSync (B3-THEME)', () => {
  it('logged-out users не делают PATCH запросов', async () => {
    render(
      <ThemeProvider>
        <SyncProbe />
      </ThemeProvider>,
    )
    await waitFor(() => {
      expect(useAuthStore.getState().hydrated).toBe(true)
    })
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it("login: localStorage 'dark' + DB 'system' → PATCH dark в DB (anon-toggle wins)", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    mockedUpdate.mockResolvedValue({
      user: {
        id: 'u-1',
        role: 'owner',
        organizationId: 'o-1',
        name: 'Иван',
        themeMode: 'dark',
      },
    })
    render(
      <ThemeProvider>
        <SyncProbe />
      </ThemeProvider>,
    )
    await waitFor(() => {
      expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    })

    act(() => {
      useAuthStore.setState({
        accessToken: 'at',
        user: {
          id: 'u-1',
          role: 'owner',
          organizationId: 'o-1',
          name: 'Иван',
          themeMode: 'system',
        },
      })
    })

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({ themeMode: 'dark' })
    })
  })

  it("login: localStorage 'system' + DB 'dark' → DB wins (apply dark, нет PATCH)", async () => {
    // localStorage пуст → mode resolves к 'system'
    render(
      <ThemeProvider>
        <SyncProbe />
      </ThemeProvider>,
    )
    await waitFor(() => {
      expect(document.documentElement.classList.contains('theme-light')).toBe(true)
    })

    act(() => {
      useAuthStore.setState({
        accessToken: 'at',
        user: {
          id: 'u-1',
          role: 'owner',
          organizationId: 'o-1',
          name: 'Иван',
          themeMode: 'dark',
        },
      })
    })

    await waitFor(() => {
      expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    })
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('logged-in toggle: setMode → PATCH к DB', async () => {
    mockedUpdate.mockResolvedValue({
      user: {
        id: 'u-1',
        role: 'owner',
        organizationId: 'o-1',
        name: 'Иван',
        themeMode: 'dark',
      },
    })

    const { getByText } = render(
      <ThemeProvider>
        <SyncProbe />
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(document.documentElement.classList.contains('theme-light')).toBe(true)
    })

    // Login с DB='light' (так same что local — нет PATCH)
    act(() => {
      useAuthStore.setState({
        accessToken: 'at',
        user: {
          id: 'u-1',
          role: 'owner',
          organizationId: 'o-1',
          name: 'Иван',
          themeMode: 'system',
        },
      })
    })
    await waitFor(() => {
      expect(useAuthStore.getState().user?.themeMode).toBe('system')
    })

    mockedUpdate.mockClear()

    // Toggle к dark — должен PATCH'нуть.
    await act(async () => {
      getByText('toggle-dark').click()
    })

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({ themeMode: 'dark' })
    })
  })
})
