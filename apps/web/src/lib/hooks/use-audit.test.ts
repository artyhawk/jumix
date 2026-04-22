import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecentAuditEvent, RecentAuditResponse } from '../api/types'
import { useRecentAudit } from './use-audit'

vi.mock('../api/audit', () => ({
  listRecentAudit: vi.fn(),
}))

import { listRecentAudit } from '../api/audit'

const list = vi.mocked(listRecentAudit)

function makeEvent(overrides: Partial<RecentAuditEvent> = {}): RecentAuditEvent {
  return {
    id: 'a-1',
    actor: { userId: 'u-1', name: 'Super', role: 'superadmin' },
    action: 'organization.create',
    target: { type: 'organization', id: 'o-1' },
    organizationId: 'o-1',
    organizationName: 'Audit Org',
    metadata: {},
    ipAddress: null,
    createdAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

const sample: RecentAuditResponse = {
  events: [makeEvent(), makeEvent({ id: 'a-2', action: 'crane_profile.approve' })],
}

beforeEach(() => {
  list.mockReset()
})

describe('useRecentAudit', () => {
  it('fetches events with default limit=20', async () => {
    list.mockResolvedValueOnce(sample)
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useRecentAudit(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(list).toHaveBeenCalledWith({ limit: 20 })
    expect(result.current.data?.events).toHaveLength(2)
  })

  it('fetches with custom limit', async () => {
    list.mockResolvedValueOnce(sample)
    const { Wrapper } = createQueryWrapper()
    renderHook(() => useRecentAudit(50), { wrapper: Wrapper })
    await waitFor(() => expect(list).toHaveBeenCalledWith({ limit: 50 }))
  })

  it('returns typed event shape', async () => {
    list.mockResolvedValueOnce(sample)
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useRecentAudit(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.events[0]?.actor.name).toBe('Super')
    expect(result.current.data?.events[0]?.action).toBe('organization.create')
  })

  it('returns error when fetch fails', async () => {
    list.mockRejectedValueOnce(new Error('boom'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useRecentAudit(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
  })
})
