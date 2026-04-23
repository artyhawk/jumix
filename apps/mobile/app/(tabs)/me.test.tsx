import { __resetApiClient } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'
import type { MeStatusResponse } from '@jumix/shared'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../tests/query-wrapper'
import MeScreen from './me'

function makeStatus(overrides: Partial<MeStatusResponse> = {}): MeStatusResponse {
  return {
    profile: {
      id: 'p1',
      userId: 'u1',
      firstName: 'Ерлан',
      lastName: 'Ахметов',
      patronymic: null,
      iin: '990101300123',
      phone: '+77001234567',
      avatarUrl: null,
      approvalStatus: 'approved',
      rejectionReason: null,
      approvedAt: '2026-04-01T00:00:00Z',
      rejectedAt: null,
      licenseStatus: 'valid',
      licenseExpiresAt: '2027-04-01T00:00:00Z',
      licenseUrl: null,
      licenseVersion: 1,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    },
    memberships: [],
    licenseStatus: 'valid',
    canWork: false,
    canWorkReasons: ['Нет активных трудоустройств'],
    ...overrides,
  }
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

describe('MeScreen', () => {
  it('загружает /me/status и показывает greeting + status card + identity', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(makeStatus({ canWork: true, canWorkReasons: [] })), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const { wrapper } = createQueryWrapper()
    render(<MeScreen />, { wrapper })

    await waitFor(() => expect(screen.getByText('Вы можете работать')).toBeInTheDocument())
    expect(screen.getByText('Ерлан')).toBeInTheDocument()
    expect(screen.getByText('Ахметов Ерлан')).toBeInTheDocument()
  })

  it('canWork=false — показывает заблокировано + reasons', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(makeStatus()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const { wrapper } = createQueryWrapper()
    render(<MeScreen />, { wrapper })

    await waitFor(() => expect(screen.getByText('Работа заблокирована')).toBeInTheDocument())
    expect(screen.getByText('Нет активных трудоустройств')).toBeInTheDocument()
  })

  // Error-state integration test не делаем — `useMeStatus` retry-predicate
  // повторяет 3 раза на NetworkError с exponential backoff, что съедает
  // ≥14s в jsdom. Error-UI покрыт отдельно в me-screen-error.test.tsx.
})
