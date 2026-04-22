import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardStats } from '../api/types'
import { useDashboardStats } from './use-dashboard'

vi.mock('../api/dashboard', () => ({
  getDashboardStats: vi.fn(),
}))

import { getDashboardStats } from '../api/dashboard'

const get = vi.mocked(getDashboardStats)

const sampleStats: DashboardStats = {
  pending: { craneProfiles: 3, organizationOperators: 2, cranes: 1 },
  active: { organizations: 10, craneProfiles: 42, cranes: 18, memberships: 37 },
  thisWeek: { newRegistrations: 5 },
}

beforeEach(() => {
  get.mockReset()
})

describe('useDashboardStats', () => {
  it('fetches stats', async () => {
    get.mockResolvedValueOnce(sampleStats)
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useDashboardStats(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(get).toHaveBeenCalled()
  })

  it('returns DashboardStats shape', async () => {
    get.mockResolvedValueOnce(sampleStats)
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useDashboardStats(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pending.craneProfiles).toBe(3)
    expect(result.current.data?.active.organizations).toBe(10)
  })

  it('returns error when fetch fails', async () => {
    get.mockRejectedValueOnce(new Error('boom'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useDashboardStats(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
  })
})
