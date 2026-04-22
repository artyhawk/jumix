import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateOrganizationResponse, Organization } from '../api/types'
import { qk } from '../query-keys'
import {
  useActivateOrganization,
  useCreateOrganization,
  useOrganization,
  useOrganizations,
  useOrganizationsInfinite,
  useSuspendOrganization,
} from './use-organizations'

vi.mock('../api/organizations', () => ({
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  createOrganization: vi.fn(),
  suspendOrganization: vi.fn(),
  activateOrganization: vi.fn(),
}))

import {
  activateOrganization,
  createOrganization,
  getOrganization,
  listOrganizations,
  suspendOrganization,
} from '../api/organizations'

const list = vi.mocked(listOrganizations)
const detail = vi.mocked(getOrganization)
const create = vi.mocked(createOrganization)
const suspend = vi.mocked(suspendOrganization)
const activate = vi.mocked(activateOrganization)

function makeOrg(id: string, status: Organization['status'] = 'active'): Organization {
  return {
    id,
    name: `Компания ${id}`,
    bin: '000140000001',
    status,
    contactName: 'Иванов И.И.',
    contactPhone: '+77010000001',
    contactEmail: null,
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-04-01T10:00:00Z',
  }
}

beforeEach(() => {
  list.mockReset()
  detail.mockReset()
  create.mockReset()
  suspend.mockReset()
  activate.mockReset()
})

describe('useOrganizations', () => {
  it('fetches list with query params', async () => {
    list.mockResolvedValueOnce({ items: [makeOrg('o-1')], nextCursor: null })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useOrganizations({ status: 'active' }), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(list).toHaveBeenCalledWith({ status: 'active' })
    expect(result.current.data?.items).toHaveLength(1)
  })
})

describe('useOrganizationsInfinite', () => {
  it('paginates via cursor', async () => {
    list.mockImplementation(async ({ cursor }: { cursor?: string } = {}) => {
      if (!cursor) return { items: [makeOrg('o1')], nextCursor: 'cur-1' }
      return { items: [makeOrg('o2')], nextCursor: null }
    })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useOrganizationsInfinite({ status: 'active' }), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(list).toHaveBeenLastCalledWith({ status: 'active', cursor: 'cur-1' })
  })
})

describe('useOrganization', () => {
  it('disabled when id is null — does not call API', () => {
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useOrganization(null), { wrapper: Wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(detail).not.toHaveBeenCalled()
  })

  it('fetches detail when id provided', async () => {
    detail.mockResolvedValueOnce(makeOrg('o-2'))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useOrganization('o-2'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(detail).toHaveBeenCalledWith('o-2')
    expect(result.current.data?.id).toBe('o-2')
  })
})

describe('useCreateOrganization', () => {
  it('invalidates organizations and dashboard on settle (success)', async () => {
    const response: CreateOrganizationResponse = {
      organization: makeOrg('o-new'),
      owner: { id: 'u-1', phone: '+77010000001' },
    }
    create.mockResolvedValueOnce(response)
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateOrganization(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        name: 'Новая',
        bin: '000140000002',
        ownerName: 'Петров',
        ownerPhone: '+77010000002',
      })
    })

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.organizations, qk.dashboard]))
  })

  it('invalidates organizations and dashboard on settle (error)', async () => {
    create.mockRejectedValueOnce(new Error('boom'))
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateOrganization(), { wrapper: Wrapper })

    await act(async () => {
      await result.current
        .mutateAsync({
          name: 'X',
          bin: '000140000003',
          ownerName: 'Y',
          ownerPhone: '+77010000003',
        })
        .catch(() => {})
    })

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.organizations, qk.dashboard]))
  })
})

describe('useSuspendOrganization', () => {
  it('calls suspend and invalidates caches', async () => {
    suspend.mockResolvedValueOnce(makeOrg('o-1', 'suspended'))
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSuspendOrganization(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('o-1')
    })

    expect(suspend).toHaveBeenCalledWith('o-1')
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.organizations, qk.dashboard]))
  })
})

describe('useActivateOrganization', () => {
  it('calls activate and invalidates caches', async () => {
    activate.mockResolvedValueOnce(makeOrg('o-1', 'active'))
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useActivateOrganization(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('o-1')
    })

    expect(activate).toHaveBeenCalledWith('o-1')
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.organizations, qk.dashboard]))
  })
})
