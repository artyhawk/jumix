'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ListSitesQuery,
  activateSite,
  archiveSite,
  completeSite,
  createSite,
  getSite,
  listSites,
  updateSite,
} from '../api/sites'
import type { CreateSiteInput, UpdateSiteInput } from '../api/types'
import { qk } from '../query-keys'

export function useSites(query: ListSitesQuery = {}) {
  return useQuery({
    queryKey: qk.sitesList(query),
    queryFn: () => listSites(query),
  })
}

export function useSitesInfinite(query: Omit<ListSitesQuery, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: qk.sitesInfinite(query),
    queryFn: ({ pageParam }) => listSites({ ...query, cursor: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  })
}

export function useSite(id: string | null) {
  return useQuery({
    queryKey: id ? qk.siteDetail(id) : ['sites', 'detail', 'disabled'],
    queryFn: () => {
      if (!id) throw new Error('missing id')
      return getSite(id)
    },
    enabled: Boolean(id),
  })
}

export function useCreateSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSiteInput) => createSite(input),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.sites })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useUpdateSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSiteInput }) => updateSite(id, patch),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: qk.sites })
      qc.invalidateQueries({ queryKey: qk.siteDetail(vars.id) })
    },
  })
}

export function useCompleteSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => completeSite(id),
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: qk.sites })
      qc.invalidateQueries({ queryKey: qk.siteDetail(id) })
    },
  })
}

export function useArchiveSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archiveSite(id),
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: qk.sites })
      qc.invalidateQueries({ queryKey: qk.siteDetail(id) })
    },
  })
}

export function useActivateSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => activateSite(id),
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: qk.sites })
      qc.invalidateQueries({ queryKey: qk.siteDetail(id) })
    },
  })
}
