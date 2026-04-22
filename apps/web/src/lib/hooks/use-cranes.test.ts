import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Crane, Paginated } from '../api/types'
import { qk } from '../query-keys'
import {
  useActivateCrane,
  useApproveCrane,
  useAssignCraneToSite,
  useCranes,
  useCranesInfinite,
  useCreateCrane,
  useRejectCrane,
  useResubmitCrane,
  useRetireCrane,
  useSetCraneMaintenance,
  useUnassignCraneFromSite,
  useUpdateCrane,
} from './use-cranes'

vi.mock('../api/cranes', () => ({
  listCranes: vi.fn(),
  getCrane: vi.fn(),
  approveCrane: vi.fn(),
  rejectCrane: vi.fn(),
  createCrane: vi.fn(),
  updateCrane: vi.fn(),
  assignCraneToSite: vi.fn(),
  unassignCraneFromSite: vi.fn(),
  activateCrane: vi.fn(),
  setCraneMaintenance: vi.fn(),
  retireCrane: vi.fn(),
  resubmitCrane: vi.fn(),
}))

import {
  activateCrane,
  approveCrane,
  assignCraneToSite,
  createCrane,
  listCranes,
  rejectCrane,
  resubmitCrane,
  retireCrane,
  setCraneMaintenance,
  unassignCraneFromSite,
  updateCrane,
} from '../api/cranes'

const list = vi.mocked(listCranes)
const approve = vi.mocked(approveCrane)
const reject = vi.mocked(rejectCrane)
const create = vi.mocked(createCrane)
const update = vi.mocked(updateCrane)
const assign = vi.mocked(assignCraneToSite)
const unassign = vi.mocked(unassignCraneFromSite)
const activate = vi.mocked(activateCrane)
const maintenance = vi.mocked(setCraneMaintenance)
const retire = vi.mocked(retireCrane)
const resubmit = vi.mocked(resubmitCrane)

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
  create.mockReset()
  update.mockReset()
  assign.mockReset()
  unassign.mockReset()
  activate.mockReset()
  maintenance.mockReset()
  retire.mockReset()
  resubmit.mockReset()
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

describe('useCranesInfinite', () => {
  it('paginates via cursor', async () => {
    list.mockImplementation(async ({ cursor }: { cursor?: string } = {}) => {
      if (!cursor) return { items: [makeCrane('c1')], nextCursor: 'cur-1' }
      return { items: [makeCrane('c2')], nextCursor: null }
    })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCranesInfinite({ search: 'tower' }), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(list).toHaveBeenLastCalledWith({ search: 'tower', cursor: 'cur-1' })
    expect(result.current.hasNextPage).toBe(false)
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

describe('useCreateCrane', () => {
  it('sends create payload', async () => {
    create.mockResolvedValueOnce(makeCrane('c-1'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCreateCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ type: 'tower', model: 'КБ-405', capacityTon: 6 })
    })

    expect(create).toHaveBeenCalledWith({ type: 'tower', model: 'КБ-405', capacityTon: 6 })
  })

  it('invalidates cranes + dashboard', async () => {
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    create.mockResolvedValueOnce(makeCrane('c-1'))
    const { result } = renderHook(() => useCreateCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ type: 'tower', model: 'x', capacityTon: 1 })
    })

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.cranes, qk.dashboard]))
  })
})

describe('useUpdateCrane', () => {
  it('sends patch payload', async () => {
    update.mockResolvedValueOnce(makeCrane('c-1'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useUpdateCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'c-1', patch: { model: 'new-model' } })
    })

    expect(update).toHaveBeenCalledWith('c-1', { model: 'new-model' })
  })

  it('invalidates list + detail', async () => {
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    update.mockResolvedValueOnce(makeCrane('c-1'))
    const { result } = renderHook(() => useUpdateCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'c-1', patch: { model: 'x' } })
    })

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.cranes, qk.craneDetail('c-1')]))
  })
})

describe('useAssignCraneToSite', () => {
  it('sends id + siteId', async () => {
    assign.mockResolvedValueOnce(makeCrane('c-1'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useAssignCraneToSite(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'c-1', siteId: 's-42' })
    })

    expect(assign).toHaveBeenCalledWith('c-1', 's-42')
  })

  it('invalidates list + detail', async () => {
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    assign.mockResolvedValueOnce(makeCrane('c-1'))
    const { result } = renderHook(() => useAssignCraneToSite(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'c-1', siteId: 's-1' })
    })

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.cranes, qk.craneDetail('c-1')]))
  })
})

describe('useUnassignCraneFromSite', () => {
  it('sends id', async () => {
    unassign.mockResolvedValueOnce(makeCrane('c-1'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useUnassignCraneFromSite(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('c-1')
    })

    expect(unassign).toHaveBeenCalledWith('c-1')
  })
})

describe('useActivateCrane / useSetCraneMaintenance / useRetireCrane', () => {
  it('activate sends id + invalidates dashboard', async () => {
    activate.mockResolvedValueOnce(makeCrane('c-1'))
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useActivateCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('c-1')
    })

    expect(activate).toHaveBeenCalledWith('c-1')
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.cranes, qk.dashboard]))
  })

  it('maintenance sends id', async () => {
    maintenance.mockResolvedValueOnce(makeCrane('c-1'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSetCraneMaintenance(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('c-1')
    })
    expect(maintenance).toHaveBeenCalledWith('c-1')
  })

  it('retire sends id', async () => {
    retire.mockResolvedValueOnce(makeCrane('c-1'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useRetireCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('c-1')
    })
    expect(retire).toHaveBeenCalledWith('c-1')
  })
})

describe('useResubmitCrane', () => {
  it('sends id', async () => {
    resubmit.mockResolvedValueOnce(makeCrane('c-1'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useResubmitCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('c-1')
    })

    expect(resubmit).toHaveBeenCalledWith('c-1')
  })

  it('invalidates cranes + detail + dashboard', async () => {
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    resubmit.mockResolvedValueOnce(makeCrane('c-1'))
    const { result } = renderHook(() => useResubmitCrane(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('c-1')
    })

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.cranes, qk.craneDetail('c-1'), qk.dashboard]))
  })
})
