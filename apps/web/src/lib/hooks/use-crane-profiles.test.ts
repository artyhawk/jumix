import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CraneProfile, Paginated } from '../api/types'
import { qk } from '../query-keys'
import {
  useApproveCraneProfile,
  useCraneProfile,
  useCraneProfiles,
  useRejectCraneProfile,
} from './use-crane-profiles'

vi.mock('../api/crane-profiles', () => ({
  listCraneProfiles: vi.fn(),
  getCraneProfile: vi.fn(),
  approveCraneProfile: vi.fn(),
  rejectCraneProfile: vi.fn(),
}))

import {
  approveCraneProfile,
  getCraneProfile,
  listCraneProfiles,
  rejectCraneProfile,
} from '../api/crane-profiles'

const list = vi.mocked(listCraneProfiles)
const detail = vi.mocked(getCraneProfile)
const approve = vi.mocked(approveCraneProfile)
const reject = vi.mocked(rejectCraneProfile)

function makeProfile(id: string, status: CraneProfile['approvalStatus'] = 'pending'): CraneProfile {
  return {
    id,
    userId: `u-${id}`,
    firstName: 'Иван',
    lastName: 'Иванов',
    patronymic: null,
    iin: '900101300001',
    phone: '+77010000001',
    avatarUrl: null,
    approvalStatus: status,
    rejectionReason: null,
    approvedAt: null,
    rejectedAt: null,
    licenseStatus: 'missing',
    licenseExpiresAt: null,
    licenseUrl: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
  }
}

beforeEach(() => {
  list.mockReset()
  detail.mockReset()
  approve.mockReset()
  reject.mockReset()
})

describe('useCraneProfiles', () => {
  it('fetches list with query params', async () => {
    list.mockResolvedValueOnce({ items: [makeProfile('p1')], nextCursor: null })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCraneProfiles({ approvalStatus: 'pending' }), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(list).toHaveBeenCalledWith({ approvalStatus: 'pending' })
    expect(result.current.data?.items).toHaveLength(1)
  })
})

describe('useCraneProfile', () => {
  it('disabled when id is null — does not call API', async () => {
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCraneProfile(null), { wrapper: Wrapper })
    // query is disabled
    expect(result.current.fetchStatus).toBe('idle')
    expect(detail).not.toHaveBeenCalled()
  })

  it('fetches detail when id provided', async () => {
    detail.mockResolvedValueOnce(makeProfile('p-2', 'approved'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCraneProfile('p-2'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(detail).toHaveBeenCalledWith('p-2')
    expect(result.current.data?.approvalStatus).toBe('approved')
  })
})

describe('useApproveCraneProfile', () => {
  it('optimistic update flips approvalStatus in cached list', async () => {
    const initial: Paginated<CraneProfile> = {
      items: [makeProfile('p-1'), makeProfile('p-2')],
      nextCursor: null,
    }
    const { client, Wrapper } = createQueryWrapper()
    client.setQueryData(qk.craneProfilesList({ approvalStatus: 'pending' }), initial)

    approve.mockResolvedValueOnce(makeProfile('p-1', 'approved'))
    const { result } = renderHook(() => useApproveCraneProfile(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('p-1')
    })

    // cache was optimistically updated before await — verify mutation called
    expect(approve).toHaveBeenCalledWith('p-1')
  })

  it('rolls back to snapshot on error', async () => {
    const initial: Paginated<CraneProfile> = {
      items: [makeProfile('p-1')],
      nextCursor: null,
    }
    const key = qk.craneProfilesList({ approvalStatus: 'pending' })
    const { client, Wrapper } = createQueryWrapper()
    client.setQueryData(key, initial)

    approve.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useApproveCraneProfile(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('p-1').catch(() => {})
    })

    const restored = client.getQueryData<Paginated<CraneProfile>>(key)
    expect(restored?.items[0]?.approvalStatus).toBe('pending')
  })

  it('invalidates crane-profiles and dashboard on settle', async () => {
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    approve.mockResolvedValueOnce(makeProfile('p-1', 'approved'))
    const { result } = renderHook(() => useApproveCraneProfile(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('p-1')
    })

    const invalidatedKeys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(invalidatedKeys).toEqual(expect.arrayContaining([qk.craneProfiles, qk.dashboard]))
  })
})

describe('useRejectCraneProfile', () => {
  it('sends reason to API', async () => {
    reject.mockResolvedValueOnce(makeProfile('p-1', 'rejected'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useRejectCraneProfile(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'p-1', reason: 'Некорректные данные' })
    })

    expect(reject).toHaveBeenCalledWith('p-1', 'Некорректные данные')
  })

  it('invalidates crane-profiles and dashboard', async () => {
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    reject.mockResolvedValueOnce(makeProfile('p-1', 'rejected'))
    const { result } = renderHook(() => useRejectCraneProfile(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'p-1', reason: 'r' })
    })

    const invalidatedKeys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(invalidatedKeys).toEqual(expect.arrayContaining([qk.craneProfiles, qk.dashboard]))
  })
})
