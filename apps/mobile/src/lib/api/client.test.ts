import { useAuthStore } from '@/stores/auth'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetApiClient, apiFetch } from './client'
import { ApiError, NetworkError } from './errors'

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function resetStore() {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: true })
}

beforeEach(() => {
  resetStore()
  __resetApiClient()
  const mem = (globalThis as unknown as { __secureStoreMemory?: Map<string, string> })
    .__secureStoreMemory
  mem?.clear()
  vi.mocked(globalThis.fetch).mockReset()
})

describe('apiFetch — basic', () => {
  it('GET returns parsed JSON', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(makeJsonResponse({ hello: 'world' }))
    const result = await apiFetch<{ hello: string }>('/api/test')
    expect(result).toEqual({ hello: 'world' })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/test',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
  })

  it('POST injects JSON body + Content-Type', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(makeJsonResponse({ ok: true }))
    await apiFetch('/api/test', { method: 'POST', body: { a: 1 } })
    const call = vi.mocked(globalThis.fetch).mock.calls[0]
    const init = call?.[1] as RequestInit
    expect(init.body).toBe('{"a":1}')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('injects Authorization header when accessToken present + not skipAuth', async () => {
    useAuthStore.setState({ accessToken: 'bearer-abc' })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(makeJsonResponse({}))
    await apiFetch('/api/test')
    const init = vi.mocked(globalThis.fetch).mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer bearer-abc')
  })

  it('skipAuth omits Authorization even when token present', async () => {
    useAuthStore.setState({ accessToken: 'bearer-abc' })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(makeJsonResponse({}))
    await apiFetch('/api/test', { skipAuth: true })
    const init = vi.mocked(globalThis.fetch).mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })
})

describe('apiFetch — errors', () => {
  it('non-OK JSON response → ApiError с code/message', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      makeJsonResponse({ error: { code: 'INVALID_PHONE', message: 'Плохой номер' } }, 422),
    )
    await expect(apiFetch('/api/test')).rejects.toMatchObject({
      code: 'INVALID_PHONE',
      message: 'Плохой номер',
      status: 422,
    })
  })

  it('non-JSON error response → ApiError с UNKNOWN_ERROR', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    )
    const err = (await apiFetch('/api/test').catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('UNKNOWN_ERROR')
    expect(err.status).toBe(500)
  })

  it('fetch throws TypeError → NetworkError', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new TypeError('offline'))
    await expect(apiFetch('/api/test')).rejects.toBeInstanceOf(NetworkError)
  })
})

describe('apiFetch — 401 refresh flow', () => {
  it('401 with valid refresh → rotates tokens + retries + returns original data', async () => {
    useAuthStore.setState({ accessToken: 'stale' })
    await SecureStore.setItemAsync('jumix.refresh', 'r1')

    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock
      // First call — 401
      .mockResolvedValueOnce(makeJsonResponse({ error: { code: 'TOKEN_EXPIRED' } }, 401))
      // Refresh call
      .mockResolvedValueOnce(makeJsonResponse({ accessToken: 'fresh', refreshToken: 'r2' }))
      // Retry of original request
      .mockResolvedValueOnce(makeJsonResponse({ payload: 'ok' }))

    const result = await apiFetch<{ payload: string }>('/api/test')
    expect(result).toEqual({ payload: 'ok' })

    // Store updated с new access
    expect(useAuthStore.getState().accessToken).toBe('fresh')
    // SecureStore с новым refresh
    expect(await SecureStore.getItemAsync('jumix.refresh')).toBe('r2')
    // Retry использует new token
    const retryCall = fetchMock.mock.calls[2]
    const retryHeaders = (retryCall?.[1] as RequestInit).headers as Record<string, string>
    expect(retryHeaders.Authorization).toBe('Bearer fresh')
  })

  it('401 + refresh fails → logout + throws ApiError', async () => {
    useAuthStore.setState({
      accessToken: 'stale',
      user: { id: 'u1', phone: '+77010001122', role: 'operator', organizationId: null, name: 'X' },
    })
    await SecureStore.setItemAsync('jumix.refresh', 'r1')

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(makeJsonResponse({ error: { code: 'TOKEN_EXPIRED' } }, 401))
      .mockResolvedValueOnce(new Response('', { status: 401 }))

    await expect(apiFetch('/api/test')).rejects.toBeInstanceOf(ApiError)

    // Store cleared (logout)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('401 без access token → не пытается refresh (initial load)', async () => {
    useAuthStore.setState({ accessToken: null })

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      makeJsonResponse({ error: { code: 'TOKEN_MISSING', message: 'no auth' } }, 401),
    )

    await expect(apiFetch('/api/test')).rejects.toMatchObject({ status: 401 })
    // Только один fetch — никаких refresh попыток
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})
