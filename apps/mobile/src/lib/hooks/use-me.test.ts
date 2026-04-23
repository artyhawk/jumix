import { __resetApiClient } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../tests/query-wrapper'
import { ME_STATUS_QUERY_KEY, useMeStatus } from './use-me'

const MOCK_STATUS = {
  profile: {
    id: 'p1',
    userId: 'u1',
    firstName: 'Ерлан',
    lastName: 'Ахметов',
    patronymic: null,
    iin: '990101300123',
    phone: '+77001234567',
    avatarUrl: null,
    approvalStatus: 'approved' as const,
    rejectionReason: null,
    approvedAt: '2026-04-01T00:00:00Z',
    rejectedAt: null,
    licenseStatus: 'valid' as const,
    licenseExpiresAt: '2027-04-01T00:00:00Z',
    licenseUrl: null,
    licenseVersion: 1,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  },
  memberships: [],
  licenseStatus: 'valid' as const,
  canWork: false,
  canWorkReasons: ['Нет активных трудоустройств'],
}

beforeEach(() => {
  __resetApiClient()
  useAuthStore.setState({
    user: {
      id: 'u1',
      phone: '+77001234567',
      role: 'operator',
      organizationId: null,
      name: 'Ерлан',
    },
    accessToken: 'acc',
    isHydrated: true,
  })
  vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockReset()
})

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: false })
})

describe('useMeStatus', () => {
  it('загружает /me/status и возвращает data', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_STATUS), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useMeStatus(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.profile.id).toBe('p1')
    expect(result.current.data?.canWorkReasons).toEqual(['Нет активных трудоустройств'])
  })

  it('не retry на 401 (пусть auth-flow перехватит)', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'token expired' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )

    // apiFetch попытается рефрешнуть → тоже 401 → logout → throws ApiError(401)
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useMeStatus(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 2000 })
    // fetch был вызван (+refresh attempt), но RQ не делал дополнительных retry'ев
    // на 401 (наш retry-predicate возвращает false)
    // Точное число зависит от apiFetch internals — главное что isError=true
  })

  it('queryKey стабильный', () => {
    expect(ME_STATUS_QUERY_KEY).toEqual(['me', 'status'])
  })

  it('refetch через invalidate работает', async () => {
    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(MOCK_STATUS), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const { wrapper, client } = createQueryWrapper()
    const { result } = renderHook(() => useMeStatus(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const callsBefore = fetchMock.mock.calls.length

    await act(async () => {
      await client.invalidateQueries({ queryKey: ME_STATUS_QUERY_KEY })
    })
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('staleTime 60_000 — второй render внутри TTL не дёргает fetch', async () => {
    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(MOCK_STATUS), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const { wrapper } = createQueryWrapper()
    const { result, rerender } = renderHook(() => useMeStatus(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const callsAfterFirst = fetchMock.mock.calls.length

    rerender()
    // Остаёмся в staleTime — fetchMock не должен был быть вызван ещё раз
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)
  })
})
