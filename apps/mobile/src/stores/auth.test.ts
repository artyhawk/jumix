import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type AuthUser, useAuthStore } from './auth'

/**
 * Auth store tests. Mock SecureStore в tests/setup.ts даёт in-memory
 * замену. Мокаем global fetch для refresh endpoint.
 */

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u-1',
    phone: '+77010001122',
    role: 'operator',
    organizationId: null,
    name: 'Иван Иванов',
    ...overrides,
  }
}

function resetStore() {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: false })
}

beforeEach(() => {
  resetStore()
  const mem = (globalThis as unknown as { __secureStoreMemory?: Map<string, string> })
    .__secureStoreMemory
  mem?.clear()
  vi.mocked(globalThis.fetch).mockReset()
})

describe('useAuthStore — initial state', () => {
  it('starts logged out, not hydrated', () => {
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
    expect(state.isHydrated).toBe(false)
  })
})

describe('login', () => {
  it('persists refresh token + user JSON + sets memory access', async () => {
    const user = makeUser()
    await useAuthStore.getState().login({ access: 'a1', refresh: 'r1' }, user)

    const state = useAuthStore.getState()
    expect(state.user).toEqual(user)
    expect(state.accessToken).toBe('a1')
    expect(await SecureStore.getItemAsync('jumix.refresh')).toBe('r1')
    expect(await SecureStore.getItemAsync('jumix.user')).toBe(JSON.stringify(user))
  })
})

describe('logout', () => {
  it('clears memory + SecureStore', async () => {
    await useAuthStore.getState().login({ access: 'a1', refresh: 'r1' }, makeUser())
    await useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
    expect(await SecureStore.getItemAsync('jumix.refresh')).toBeNull()
    expect(await SecureStore.getItemAsync('jumix.user')).toBeNull()
  })
})

describe('hydrate — happy path', () => {
  it('no stored token → logged out + isHydrated=true', async () => {
    await useAuthStore.getState().hydrate()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
    expect(state.isHydrated).toBe(true)
  })

  it('stored refresh + user + refresh succeeds → restores session', async () => {
    const user = makeUser()
    await SecureStore.setItemAsync('jumix.refresh', 'r1')
    await SecureStore.setItemAsync('jumix.user', JSON.stringify(user))

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await useAuthStore.getState().hydrate()
    const state = useAuthStore.getState()
    expect(state.user).toEqual(user)
    expect(state.accessToken).toBe('new-access')
    expect(state.isHydrated).toBe(true)
    expect(await SecureStore.getItemAsync('jumix.refresh')).toBe('new-refresh')
  })
})

describe('hydrate — failure cases', () => {
  it('stored token + refresh fails → clears state + isHydrated', async () => {
    await SecureStore.setItemAsync('jumix.refresh', 'r1')
    await SecureStore.setItemAsync('jumix.user', JSON.stringify(makeUser()))
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('', { status: 401 }))

    await useAuthStore.getState().hydrate()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
    expect(state.isHydrated).toBe(true)
    expect(await SecureStore.getItemAsync('jumix.refresh')).toBeNull()
    expect(await SecureStore.getItemAsync('jumix.user')).toBeNull()
  })

  it('corrupted user JSON → clears + logged out', async () => {
    await SecureStore.setItemAsync('jumix.refresh', 'r1')
    await SecureStore.setItemAsync('jumix.user', '{invalid json')

    await useAuthStore.getState().hydrate()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isHydrated).toBe(true)
    expect(await SecureStore.getItemAsync('jumix.refresh')).toBeNull()
  })

  it('fetch throws (offline) → clears state', async () => {
    await SecureStore.setItemAsync('jumix.refresh', 'r1')
    await SecureStore.setItemAsync('jumix.user', JSON.stringify(makeUser()))
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new TypeError('network'))

    await useAuthStore.getState().hydrate()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isHydrated).toBe(true)
  })
})

describe('setAccessToken', () => {
  it('updates in memory без touching SecureStore', async () => {
    await useAuthStore.getState().login({ access: 'a1', refresh: 'r1' }, makeUser())
    useAuthStore.getState().setAccessToken('new-access')
    expect(useAuthStore.getState().accessToken).toBe('new-access')
    expect(await SecureStore.getItemAsync('jumix.refresh')).toBe('r1')
  })
})

describe('setRefreshToken', () => {
  it('persists new refresh token в SecureStore', async () => {
    await useAuthStore.getState().setRefreshToken('r-new')
    expect(await SecureStore.getItemAsync('jumix.refresh')).toBe('r-new')
  })
})
