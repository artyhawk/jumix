import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShiftWithRelations } from '../api/types'
import { useOwnerShifts, useOwnerShiftsInfinite, useShiftDetail } from './use-shifts'

vi.mock('../api/shifts', () => ({
  listOwnerShifts: vi.fn(),
  listMyShifts: vi.fn(),
  getMyActiveShift: vi.fn(),
  getShift: vi.fn(),
  getAvailableCranes: vi.fn(),
  startShift: vi.fn(),
  pauseShift: vi.fn(),
  resumeShift: vi.fn(),
  endShift: vi.fn(),
}))

import { getShift, listOwnerShifts } from '../api/shifts'

const listOwner = vi.mocked(listOwnerShifts)
const detail = vi.mocked(getShift)

function makeShift(overrides: Partial<ShiftWithRelations> = {}): ShiftWithRelations {
  return {
    id: 'sh-1',
    craneId: 'c-1',
    operatorId: 'u-1',
    craneProfileId: 'cp-1',
    organizationId: 'org-1',
    siteId: 's-1',
    status: 'active',
    startedAt: '2026-04-24T09:00:00Z',
    endedAt: null,
    pausedAt: null,
    totalPauseSeconds: 0,
    notes: null,
    createdAt: '2026-04-24T09:00:00Z',
    updatedAt: '2026-04-24T09:00:00Z',
    crane: {
      id: 'c-1',
      model: 'Liebherr',
      inventoryNumber: 'INV-1',
      type: 'tower',
      capacityTon: 10,
    },
    site: { id: 's-1', name: 'Site', address: null },
    organization: { id: 'org-1', name: 'Org' },
    operator: { id: 'cp-1', firstName: 'Иван', lastName: 'Иванов', patronymic: null },
    ...overrides,
  }
}

beforeEach(() => {
  listOwner.mockReset()
  detail.mockReset()
})

describe('useOwnerShifts', () => {
  it('fetches owner shifts with query params', async () => {
    listOwner.mockResolvedValueOnce({ items: [makeShift()], nextCursor: null })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useOwnerShifts({ siteId: 's-1', status: 'live' }), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(listOwner).toHaveBeenCalledWith({ siteId: 's-1', status: 'live' })
    expect(result.current.data?.items).toHaveLength(1)
  })
})

describe('useOwnerShiftsInfinite', () => {
  it('paginates через cursor', async () => {
    listOwner
      .mockResolvedValueOnce({ items: [makeShift({ id: 'sh-1' })], nextCursor: 'next-1' })
      .mockResolvedValueOnce({ items: [makeShift({ id: 'sh-2' })], nextCursor: null })

    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useOwnerShiftsInfinite({ status: 'live' }), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(true)

    await result.current.fetchNextPage()
    await waitFor(() => {
      expect(result.current.data?.pages).toHaveLength(2)
    })
    expect(result.current.hasNextPage).toBe(false)
  })
})

describe('useShiftDetail', () => {
  it('fetches shift by id', async () => {
    detail.mockResolvedValueOnce(makeShift({ id: 'sh-detail' }))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useShiftDetail('sh-detail'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(detail).toHaveBeenCalledWith('sh-detail')
    expect(result.current.data?.id).toBe('sh-detail')
  })

  it('disabled when id undefined', async () => {
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useShiftDetail(undefined), { wrapper: Wrapper })
    // Не запрашивает
    expect(detail).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(true)
  })
})
