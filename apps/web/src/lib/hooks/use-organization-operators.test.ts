import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationOperator, Paginated } from '../api/types'
import { qk } from '../query-keys'
import {
  useApproveOrganizationOperator,
  useOrganizationOperators,
  useRejectOrganizationOperator,
} from './use-organization-operators'

vi.mock('../api/organization-operators', () => ({
  listOrganizationOperators: vi.fn(),
  getOrganizationOperator: vi.fn(),
  approveOrganizationOperator: vi.fn(),
  rejectOrganizationOperator: vi.fn(),
}))

import {
  approveOrganizationOperator,
  listOrganizationOperators,
  rejectOrganizationOperator,
} from '../api/organization-operators'

const list = vi.mocked(listOrganizationOperators)
const approve = vi.mocked(approveOrganizationOperator)
const reject = vi.mocked(rejectOrganizationOperator)

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
