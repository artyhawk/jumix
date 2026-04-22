import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardStats, OwnerDashboardStats } from '../api/types'
import { useDashboardStats, useOwnerDashboardStats } from './use-dashboard'

vi.mock('../api/dashboard', () => ({
  getDashboardStats: vi.fn(),
  getOwnerDashboardStats: vi.fn(),
}))

import { getDashboardStats, getOwnerDashboardStats } from '../api/dashboard'

const get = vi.mocked(getDashboardStats)
const getOwner = vi.mocked(getOwnerDashboardStats)

const sampleStats: DashboardStats = {
  pending: { craneProfiles: 3, organizationOperators: 2, cranes: 1 },
  active: { organizations: 10, craneProfiles: 42, cranes: 18, memberships: 37 },
  thisWeek: { newRegistrations: 5 },
}

const sampleOwnerStats: OwnerDashboardStats = {
  active: { sites: 4, cranes: 7, memberships: 12 },
  pending: { cranes: 2, hires: 1 },
}

beforeEach(() => {
  get.mockReset()
  getOwner.mockReset()
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

describe('useOwnerDashboardStats', () => {
  it('fetches owner-scoped stats', async () => {
    getOwner.mockResolvedValueOnce(sampleOwnerStats)
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useOwnerDashboardStats(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getOwner).toHaveBeenCalled()
    expect(result.current.data?.active.cranes).toBe(7)
    expect(result.current.data?.pending.cranes).toBe(2)
  })

  it('respects enabled=false', () => {
    getOwner.mockResolvedValueOnce(sampleOwnerStats)
    const { Wrapper } = createQueryWrapper()
    renderHook(() => useOwnerDashboardStats(false), { wrapper: Wrapper })
    expect(getOwner).not.toHaveBeenCalled()
  })
})
