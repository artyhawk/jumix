import { __resetApiClient } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'
import type { MeStatusResponse } from '@jumix/shared'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../tests/query-wrapper'
import MembershipsListScreen from './index'

const BASE_PROFILE = {
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
}

function makeStatus(overrides: Partial<MeStatusResponse> = {}): MeStatusResponse {
  return {
    profile: BASE_PROFILE,
    memberships: [],
    licenseStatus: 'valid',
    canWork: false,
    canWorkReasons: [],
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

describe('MembershipsListScreen', () => {
  it('empty state когда memberships=[]', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(makeStatus()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const { wrapper } = createQueryWrapper()
    render(<MembershipsListScreen />, { wrapper })

    await waitFor(() => expect(screen.getByText('У вас нет трудоустройств')).toBeInTheDocument())
  })

  it('рендерит список с org names', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify(
          makeStatus({
            memberships: [
              {
                id: 'h1',
                organizationId: 'o1',
                organizationName: 'СтройТехКран',
                approvalStatus: 'approved',
                status: 'active',
                hiredAt: '2026-03-01T00:00:00Z',
                approvedAt: '2026-03-02T00:00:00Z',
                rejectedAt: null,
                terminatedAt: null,
                rejectionReason: null,
              },
              {
                id: 'h2',
                organizationId: 'o2',
                organizationName: 'БашКранСервис',
                approvalStatus: 'pending',
                status: 'active',
                hiredAt: '2026-04-10T00:00:00Z',
                approvedAt: null,
                rejectedAt: null,
                terminatedAt: null,
                rejectionReason: null,
              },
            ],
          }),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const { wrapper } = createQueryWrapper()
    render(<MembershipsListScreen />, { wrapper })

    await waitFor(() => expect(screen.getByText('СтройТехКран')).toBeInTheDocument())
    expect(screen.getByText('БашКранСервис')).toBeInTheDocument()
  })
})
