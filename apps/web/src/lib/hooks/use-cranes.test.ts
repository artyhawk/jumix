import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Crane, Paginated } from '../api/types'
import { qk } from '../query-keys'
import { useApproveCrane, useCranes, useRejectCrane } from './use-cranes'

vi.mock('../api/cranes', () => ({
  listCranes: vi.fn(),
  getCrane: vi.fn(),
  approveCrane: vi.fn(),
  rejectCrane: vi.fn(),
}))

import { approveCrane, listCranes, rejectCrane } from '../api/cranes'

const list = vi.mocked(listCranes)
const approve = vi.mocked(approveCrane)
const reject = vi.mocked(rejectCrane)

function makeCrane(id: string, status: Crane['approvalStatus'] = 'pending'): Crane {
  return {
    id,
    organizationId: 'org-1',
    siteId: null,
    type: 'tower',
    model: 'КБ-403',
    inventoryNumber: 'INV-100',
    capacityTon: 8,
    boomLengthM: 40,
    yearManufactured: 2018,
    status: 'active',
    approvalStatus: status,
    rejectionReason: null,
    notes: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
  }
}

beforeEach(() => {
  list.mockReset()
  approve.mockReset()
  reject.mockReset()
})

describe('useCranes', () => {
  it('fetches cranes list', async () => {
    list.mockResolvedValueOnce({ items: [makeCrane('c1')], nextCursor: null })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCranes({ approvalStatus: 'pending' }), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(list).toHaveBeenCalledWith({ approvalStatus: 'pending' })
  })
})

describe('useApproveCrane', () => {
  it('optimistic update flips approvalStatus in cache before await', async () => {
    const key = qk.cranesList({ approvalStatus: 'pending' })
    const initial: Paginated<Crane> = { items: [makeCrane('c-1')], nextCursor: null }
    const { client, Wrapper } = createQueryWrapper()
    client.setQueryData(key, initial)

    approve.mockResolvedValueOnce(makeCrane('c-1', 'approved'))
    const { result } = renderHook(() => useApproveCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('c-1')
    })

    expect(approve).toHaveBeenCalledWith('c-1')
  })

  it('rolls back on error', async () => {
    const key = qk.cranesList({ approvalStatus: 'pending' })
    const initial: Paginated<Crane> = { items: [makeCrane('c-1')], nextCursor: null }
    const { client, Wrapper } = createQueryWrapper()
    client.setQueryData(key, initial)

    approve.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useApproveCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('c-1').catch(() => {})
    })

    const restored = client.getQueryData<Paginated<Crane>>(key)
    expect(restored?.items[0]?.approvalStatus).toBe('pending')
  })

  it('invalidates cranes + dashboard', async () => {
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    approve.mockResolvedValueOnce(makeCrane('c-1', 'approved'))
    const { result } = renderHook(() => useApproveCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('c-1')
    })

    const invalidatedKeys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(invalidatedKeys).toEqual(expect.arrayContaining([qk.cranes, qk.dashboard]))
  })
})

describe('useRejectCrane', () => {
  it('sends reason + id', async () => {
    reject.mockResolvedValueOnce(makeCrane('c-1', 'rejected'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useRejectCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'c-1', reason: 'нет документов' })
    })

    expect(reject).toHaveBeenCalledWith('c-1', 'нет документов')
  })

  it('invalidates cranes + dashboard', async () => {
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    reject.mockResolvedValueOnce(makeCrane('c-1', 'rejected'))
    const { result } = renderHook(() => useRejectCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'c-1', reason: 'r' })
    })

    const invalidatedKeys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(invalidatedKeys).toEqual(expect.arrayContaining([qk.cranes, qk.dashboard]))
  })
})
