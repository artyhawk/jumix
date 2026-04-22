import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../api/types'
import { qk } from '../query-keys'
import {
  useActivateSite,
  useArchiveSite,
  useCompleteSite,
  useCreateSite,
  useSite,
  useSites,
  useSitesInfinite,
  useUpdateSite,
} from './use-sites'

vi.mock('../api/sites', () => ({
  listSites: vi.fn(),
  getSite: vi.fn(),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  completeSite: vi.fn(),
  archiveSite: vi.fn(),
  activateSite: vi.fn(),
}))

import {
  activateSite,
  archiveSite,
  completeSite,
  createSite,
  getSite,
  listSites,
  updateSite,
} from '../api/sites'

const list = vi.mocked(listSites)
const detail = vi.mocked(getSite)
const create = vi.mocked(createSite)
const update = vi.mocked(updateSite)
const complete = vi.mocked(completeSite)
const archive = vi.mocked(archiveSite)
const activate = vi.mocked(activateSite)

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 's-1',
    organizationId: 'org-1',
    name: 'Объект 1',
    address: 'ул. Абая, 1',
    latitude: 51.169392,
    longitude: 71.449074,
    radiusM: 200,
    status: 'active',
    notes: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  list.mockReset()
  detail.mockReset()
  create.mockReset()
  update.mockReset()
  complete.mockReset()
  archive.mockReset()
  activate.mockReset()
})

describe('useSites', () => {
  it('fetches list with query params', async () => {
    list.mockResolvedValueOnce({ items: [makeSite()], nextCursor: null })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSites({ status: 'active' }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(list).toHaveBeenCalledWith({ status: 'active' })
    expect(result.current.data?.items).toHaveLength(1)
  })
})

describe('useSitesInfinite', () => {
  it('paginates via cursor', async () => {
    list.mockImplementation(async ({ cursor }: { cursor?: string } = {}) => {
      if (!cursor) return { items: [makeSite({ id: 's1' })], nextCursor: 'cur-1' }
      return { items: [makeSite({ id: 's2' })], nextCursor: null }
    })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSitesInfinite({ status: 'active' }), {
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

describe('useSite', () => {
  it('disabled when id is null — does not call API', () => {
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSite(null), { wrapper: Wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(detail).not.toHaveBeenCalled()
  })

  it('fetches detail when id provided', async () => {
    detail.mockResolvedValueOnce(makeSite({ id: 's-2' }))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSite('s-2'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(detail).toHaveBeenCalledWith('s-2')
    expect(result.current.data?.id).toBe('s-2')
  })
})

describe('useCreateSite', () => {
  it('invalidates sites and dashboard on settle (success)', async () => {
    create.mockResolvedValueOnce(makeSite({ id: 's-new' }))
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateSite(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        name: 'Новый',
        latitude: 51.1,
        longitude: 71.4,
        radiusM: 200,
      })
    })

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.sites, qk.dashboard]))
  })

  it('invalidates on error as well', async () => {
    create.mockRejectedValueOnce(new Error('boom'))
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateSite(), { wrapper: Wrapper })

    await act(async () => {
      await result.current
        .mutateAsync({ name: 'X', latitude: 51.1, longitude: 71.4 })
        .catch(() => {})
    })

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.sites, qk.dashboard]))
  })
})

describe('useUpdateSite', () => {
  it('invalidates list + detail with correct id', async () => {
    update.mockResolvedValueOnce(makeSite({ id: 's-1', name: 'Новое имя' }))
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateSite(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 's-1', patch: { name: 'Новое имя' } })
    })

    expect(update).toHaveBeenCalledWith('s-1', { name: 'Новое имя' })
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.sites, qk.siteDetail('s-1')]))
  })
})

describe('useCompleteSite / useArchiveSite / useActivateSite', () => {
  it('complete calls API + invalidates', async () => {
    complete.mockResolvedValueOnce(makeSite({ id: 's-1', status: 'completed' }))
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCompleteSite(), { wrapper: Wrapper })
    await act(async () => {
      await result.current.mutateAsync('s-1')
    })
    expect(complete).toHaveBeenCalledWith('s-1')
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.sites, qk.siteDetail('s-1')]))
  })

  it('archive calls API + invalidates', async () => {
    archive.mockResolvedValueOnce(makeSite({ id: 's-1', status: 'archived' }))
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useArchiveSite(), { wrapper: Wrapper })
    await act(async () => {
      await result.current.mutateAsync('s-1')
    })
    expect(archive).toHaveBeenCalledWith('s-1')
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.sites, qk.siteDetail('s-1')]))
  })

  it('activate calls API + invalidates', async () => {
    activate.mockResolvedValueOnce(makeSite({ id: 's-1', status: 'active' }))
    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useActivateSite(), { wrapper: Wrapper })
    await act(async () => {
      await result.current.mutateAsync('s-1')
    })
    expect(activate).toHaveBeenCalledWith('s-1')
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.sites, qk.siteDetail('s-1')]))
  })
})
