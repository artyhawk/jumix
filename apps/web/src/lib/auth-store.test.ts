import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectIsAuthenticated, useAuthStore } from './auth-store'

vi.mock('./api/auth', () => ({
  refreshTokens: vi.fn(),
  logout: vi.fn(),
}))

import { logout as logoutApi, refreshTokens } from './api/auth'

const mockedRefresh = vi.mocked(refreshTokens)
const mockedLogout = vi.mocked(logoutApi)

const sampleUser = {
  id: 'u-1',
  role: 'owner' as const,
  organizationId: 'o-1',
  name: 'Иван',
}

beforeEach(() => {
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    user: null,
    hydrated: true,
  })
  mockedRefresh.mockReset()
  mockedLogout.mockReset()
  if (typeof window !== 'undefined') window.localStorage.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('auth-store', () => {
  it('setSession populates all session fields', () => {
    useAuthStore.getState().setSession({
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: '2026-04-22T00:00:00Z',
      refreshTokenExpiresAt: '2026-05-22T00:00:00Z',
      user: sampleUser,
    })
    const s = useAuthStore.getState()
    expect(s.accessToken).toBe('at')
    expect(s.user).toEqual(sampleUser)
    expect(selectIsAuthenticated(s)).toBe(true)
  })

  it('clear() resets everything', () => {
    useAuthStore.setState({
      accessToken: 'at',
      refreshToken: 'rt',
      user: sampleUser,
    })
    useAuthStore.getState().clear()
    const s = useAuthStore.getState()
    expect(s.accessToken).toBeNull()
    expect(s.user).toBeNull()
    expect(selectIsAuthenticated(s)).toBe(false)
  })

  it('refresh() returns false when no refresh token', async () => {
    const ok = await useAuthStore.getState().refresh()
    expect(ok).toBe(false)
    expect(mockedRefresh).not.toHaveBeenCalled()
  })

  it('refresh() updates tokens on success', async () => {
    useAuthStore.setState({ refreshToken: 'rt-old' })
    mockedRefresh.mockResolvedValueOnce({
      accessToken: 'at-new',
      refreshToken: 'rt-new',
      accessTokenExpiresAt: '2026-04-22T00:30:00Z',
      refreshTokenExpiresAt: '2026-05-22T00:30:00Z',
    })
    const ok = await useAuthStore.getState().refresh()
    expect(ok).toBe(true)
    expect(useAuthStore.getState().accessToken).toBe('at-new')
    expect(useAuthStore.getState().refreshToken).toBe('rt-new')
  })

  it('refresh() clears tokens and returns false on failure', async () => {
    useAuthStore.setState({
      refreshToken: 'rt-old',
      accessToken: 'at-old',
      user: sampleUser,
    })
    mockedRefresh.mockRejectedValueOnce(new Error('expired'))
    const ok = await useAuthStore.getState().refresh()
    expect(ok).toBe(false)
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('logout() calls API and clears state, even if API fails', async () => {
    useAuthStore.setState({
      refreshToken: 'rt',
      accessToken: 'at',
      user: sampleUser,
    })
    mockedLogout.mockRejectedValueOnce(new Error('network'))
    await useAuthStore.getState().logout()
    expect(mockedLogout).toHaveBeenCalledWith('rt')
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
