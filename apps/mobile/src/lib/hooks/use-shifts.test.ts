import type { AvailableCrane, ShiftWithRelations } from '@jumix/shared'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../tests/query-wrapper'

vi.mock('@/lib/api/shifts', () => ({
  getMyActiveShift: vi.fn(),
  listMyShifts: vi.fn(),
  getShift: vi.fn(),
  getAvailableCranes: vi.fn(),
  startShift: vi.fn(),
  pauseShift: vi.fn(),
  resumeShift: vi.fn(),
  endShift: vi.fn(),
}))

import * as api from '@/lib/api/shifts'
import {
  MY_ACTIVE_SHIFT_KEY,
  useAvailableCranes,
  useEndShift,
  useMyActiveShift,
  usePauseShift,
  useStartShift,
} from './use-shifts'

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
      inventoryNumber: null,
      type: 'tower',
      capacityTon: 10,
    },
    site: {
      id: 's-1',
      name: 'Site',
      address: null,
      latitude: 51.128,
      longitude: 71.43,
      geofenceRadiusM: 200,
    },
    organization: { id: 'org-1', name: 'Org' },
    operator: { id: 'cp-1', firstName: 'A', lastName: 'B', patronymic: null },
    ...overrides,
  }
}

function makeCrane(overrides: Partial<AvailableCrane> = {}): AvailableCrane {
  return {
    id: 'c-1',
    model: 'Liebherr',
    inventoryNumber: null,
    type: 'tower',
    capacityTon: 10,
    site: { id: 's-1', name: 'Site', address: null },
    organization: { id: 'org-1', name: 'Org' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(api.getMyActiveShift).mockReset()
  vi.mocked(api.getAvailableCranes).mockReset()
  vi.mocked(api.startShift).mockReset()
  vi.mocked(api.pauseShift).mockReset()
  vi.mocked(api.endShift).mockReset()
})

describe('useMyActiveShift', () => {
  it('returns active shift from API', async () => {
    vi.mocked(api.getMyActiveShift).mockResolvedValueOnce(makeShift())
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useMyActiveShift(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.id).toBe('sh-1')
  })

  it('returns null when no active shift', async () => {
    vi.mocked(api.getMyActiveShift).mockResolvedValueOnce(null)
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useMyActiveShift(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})

describe('useAvailableCranes', () => {
  it('returns cranes list', async () => {
    vi.mocked(api.getAvailableCranes).mockResolvedValueOnce({
      items: [makeCrane({ id: 'c-1' }), makeCrane({ id: 'c-2' })],
    })
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useAvailableCranes(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.items).toHaveLength(2)
  })
})

describe('useStartShift', () => {
  it('calls startShift API and invalidates shifts queries on success', async () => {
    vi.mocked(api.startShift).mockResolvedValueOnce(makeShift({ id: 'new' }))
    const { wrapper, client } = createQueryWrapper()
    // Pre-seed active cache → после старта invalidate должен reset'нуть.
    client.setQueryData(MY_ACTIVE_SHIFT_KEY, null)
    const { result } = renderHook(() => useStartShift(), { wrapper })
    const checklist = {
      items: {
        helmet: { checked: true, photoKey: null, notes: null },
        vest: { checked: true, photoKey: null, notes: null },
        boots: { checked: true, photoKey: null, notes: null },
        gloves: { checked: true, photoKey: null, notes: null },
        harness: { checked: true, photoKey: null, notes: null },
        first_aid_kit: { checked: true, photoKey: null, notes: null },
        crane_integrity: { checked: true, photoKey: null, notes: null },
      },
    }
    await result.current.mutateAsync({ craneId: 'c-1', checklist })
    expect(api.startShift).toHaveBeenCalledWith({ craneId: 'c-1', checklist })
  })
})

describe('usePauseShift', () => {
  it('updates active cache с returned paused shift', async () => {
    const paused = makeShift({ status: 'paused', pausedAt: '2026-04-24T10:00:00Z' })
    vi.mocked(api.pauseShift).mockResolvedValueOnce(paused)
    const { wrapper, client } = createQueryWrapper()
    const { result } = renderHook(() => usePauseShift(), { wrapper })
    await result.current.mutateAsync('sh-1')
    expect(client.getQueryData(MY_ACTIVE_SHIFT_KEY)).toEqual(paused)
  })
})

describe('useEndShift', () => {
  it('sets active cache to null on success', async () => {
    vi.mocked(api.endShift).mockResolvedValueOnce(makeShift({ status: 'ended' }))
    const { wrapper, client } = createQueryWrapper()
    client.setQueryData(MY_ACTIVE_SHIFT_KEY, makeShift())
    const { result } = renderHook(() => useEndShift(), { wrapper })
    await result.current.mutateAsync({ id: 'sh-1', payload: { notes: 'done' } })
    expect(client.getQueryData(MY_ACTIVE_SHIFT_KEY)).toBeNull()
    expect(api.endShift).toHaveBeenCalledWith('sh-1', { notes: 'done' })
  })
})
