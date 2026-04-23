import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationOperator, Paginated } from '../api/types'
import { qk } from '../query-keys'
import {
  useActivateOrganizationOperator,
  useApproveOrganizationOperator,
  useBlockOrganizationOperator,
  useCreateHireRequest,
  useOrganizationOperators,
  useOrganizationOperatorsInfinite,
  useRejectOrganizationOperator,
  useTerminateOrganizationOperator,
} from './use-organization-operators'

vi.mock('../api/organization-operators', () => ({
  listOrganizationOperators: vi.fn(),
  getOrganizationOperator: vi.fn(),
  approveOrganizationOperator: vi.fn(),
  rejectOrganizationOperator: vi.fn(),
  createHireRequest: vi.fn(),
  blockOrganizationOperator: vi.fn(),
  activateOrganizationOperator: vi.fn(),
  terminateOrganizationOperator: vi.fn(),
}))

import {
  activateOrganizationOperator,
  approveOrganizationOperator,
  blockOrganizationOperator,
  createHireRequest,
  listOrganizationOperators,
  rejectOrganizationOperator,
  terminateOrganizationOperator,
} from '../api/organization-operators'

const list = vi.mocked(listOrganizationOperators)
const approve = vi.mocked(approveOrganizationOperator)
const reject = vi.mocked(rejectOrganizationOperator)
const create = vi.mocked(createHireRequest)
const block = vi.mocked(blockOrganizationOperator)
const activate = vi.mocked(activateOrganizationOperator)
const terminate = vi.mocked(terminateOrganizationOperator)

function makeHire(
  id: string,
  status: OrganizationOperator['approvalStatus'] = 'pending',
): OrganizationOperator {
  return {
    id,
    craneProfileId: `cp-${id}`,
    organizationId: 'org-1',
    craneProfile: {
      id: `cp-${id}`,
      firstName: 'Иван',
      lastName: 'Иванов',
      patronymic: null,
      iin: '900101300001',
      avatarUrl: null,
      licenseStatus: 'valid',
    },
    hiredAt: null,
    terminatedAt: null,
    status: 'active',
    availability: null,
    approvalStatus: status,
    rejectionReason: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
  }
}

beforeEach(() => {
  list.mockReset()
  approve.mockReset()
  reject.mockReset()
  create.mockReset()
  block.mockReset()
  activate.mockReset()
  terminate.mockReset()
})

describe('useOrganizationOperators', () => {
  it('fetches list with pending filter', async () => {
    list.mockResolvedValueOnce({ items: [makeHire('h1')], nextCursor: null })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useOrganizationOperators({ approvalStatus: 'pending' }), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(list).toHaveBeenCalledWith({ approvalStatus: 'pending' })
  })
})

describe('useOrganizationOperatorsInfinite', () => {
  it('paginates via cursor', async () => {
    list.mockImplementation(async ({ cursor }: { cursor?: string } = {}) => {
      if (!cursor) return { items: [makeHire('h1')], nextCursor: 'cur-1' }
      return { items: [makeHire('h2')], nextCursor: null }
    })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(
      () => useOrganizationOperatorsInfinite({ organizationId: 'org-1' }),
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(list).toHaveBeenLastCalledWith({ organizationId: 'org-1', cursor: 'cur-1' })
  })
})

describe('useApproveOrganizationOperator', () => {
  it('optimistic update flips approvalStatus in cache', async () => {
    const key = qk.organizationOperatorsList({ approvalStatus: 'pending' })
    const initial: Paginated<OrganizationOperator> = {
      items: [makeHire('h-1')],
      nextCursor: null,
    }
    const { client, Wrapper } = createQueryWrapper()
    client.setQueryData(key, initial)

    approve.mockResolvedValueOnce(makeHire('h-1', 'approved'))
    const { result } = renderHook(() => useApproveOrganizationOperator(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('h-1')
    })

    expect(approve).toHaveBeenCalledWith('h-1')
  })

  it('rolls back on error', async () => {
    const key = qk.organizationOperatorsList({ approvalStatus: 'pending' })
    const initial: Paginated<OrganizationOperator> = {
      items: [makeHire('h-1')],
      nextCursor: null,
    }
    const { client, Wrapper } = createQueryWrapper()
    client.setQueryData(key, initial)

    approve.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useApproveOrganizationOperator(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('h-1').catch(() => {})
    })

    const restored = client.getQueryData<Paginated<OrganizationOperator>>(key)
    expect(restored?.items[0]?.approvalStatus).toBe('pending')
  })

  it('invalidates organization-operators + dashboard', async () => {
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    approve.mockResolvedValueOnce(makeHire('h-1', 'approved'))
    const { result } = renderHook(() => useApproveOrganizationOperator(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('h-1')
    })

    const invalidatedKeys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([qk.organizationOperators, qk.dashboard]),
    )
  })
})

describe('useRejectOrganizationOperator', () => {
  it('sends reason to API', async () => {
    reject.mockResolvedValueOnce(makeHire('h-1', 'rejected'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useRejectOrganizationOperator(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'h-1', reason: 'duplicate' })
    })

    expect(reject).toHaveBeenCalledWith('h-1', 'duplicate')
  })
})

describe('useCreateHireRequest', () => {
  it('posts payload and invalidates dashboard + list', async () => {
    create.mockResolvedValueOnce(makeHire('h-new', 'pending'))
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateHireRequest(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ craneProfileId: 'cp-new', hiredAt: '2026-04-20' })
    })

    expect(create).toHaveBeenCalledWith({ craneProfileId: 'cp-new', hiredAt: '2026-04-20' })
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.organizationOperators, qk.dashboard]))
  })
})

describe('useBlockOrganizationOperator', () => {
  it('optimistic flip active → blocked', async () => {
    const key = qk.organizationOperatorsList({ approvalStatus: 'approved' })
    const hire = makeHire('h-1', 'approved')
    const { client, Wrapper } = createQueryWrapper()
    client.setQueryData(key, { items: [hire], nextCursor: null })

    block.mockResolvedValueOnce({ ...hire, status: 'blocked' })
    const { result } = renderHook(() => useBlockOrganizationOperator(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'h-1', reason: 'disciplinary' })
    })

    expect(block).toHaveBeenCalledWith('h-1', 'disciplinary')
  })

  it('omits reason when not provided', async () => {
    const hire = makeHire('h-1', 'approved')
    block.mockResolvedValueOnce({ ...hire, status: 'blocked' })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useBlockOrganizationOperator(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'h-1' })
    })

    expect(block).toHaveBeenCalledWith('h-1', undefined)
  })

  it('rolls back optimistic flip on error', async () => {
    const key = qk.organizationOperatorsList({ approvalStatus: 'approved' })
    const hire = makeHire('h-1', 'approved')
    const { client, Wrapper } = createQueryWrapper()
    client.setQueryData(key, { items: [hire], nextCursor: null })

    block.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useBlockOrganizationOperator(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'h-1' }).catch(() => {})
    })

    const restored = client.getQueryData<Paginated<OrganizationOperator>>(key)
    expect(restored?.items[0]?.status).toBe('active')
  })
})

describe('useActivateOrganizationOperator', () => {
  it('calls activate API', async () => {
    const hire = makeHire('h-1', 'approved')
    activate.mockResolvedValueOnce({ ...hire, status: 'active' })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useActivateOrganizationOperator(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('h-1')
    })

    expect(activate).toHaveBeenCalledWith('h-1')
  })
})

describe('useTerminateOrganizationOperator', () => {
  it('optimistic flip to terminated', async () => {
    const key = qk.organizationOperatorsList({ approvalStatus: 'approved' })
    const hire = makeHire('h-1', 'approved')
    const { client, Wrapper } = createQueryWrapper()
    client.setQueryData(key, { items: [hire], nextCursor: null })

    terminate.mockResolvedValueOnce({ ...hire, status: 'terminated' })
    const { result } = renderHook(() => useTerminateOrganizationOperator(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('h-1')
    })

    expect(terminate).toHaveBeenCalledWith('h-1')
  })
})
