'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ListCraneProfilesQuery,
  approveCraneProfile,
  getCraneProfile,
  listCraneProfiles,
  rejectCraneProfile,
} from '../api/crane-profiles'
import type { CraneProfile, Paginated } from '../api/types'
import { qk } from '../query-keys'

export function useCraneProfiles(query: ListCraneProfilesQuery = {}) {
  return useQuery({
    queryKey: qk.craneProfilesList(query),
    queryFn: () => listCraneProfiles(query),
  })
}

export function useCraneProfilesInfinite(query: Omit<ListCraneProfilesQuery, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: qk.craneProfilesInfinite(query),
    queryFn: ({ pageParam }) =>
      listCraneProfiles({ ...query, cursor: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  })
}

export function useCraneProfile(id: string | null) {
  return useQuery({
    queryKey: id ? qk.craneProfileDetail(id) : ['crane-profiles', 'detail', 'disabled'],
    queryFn: () => {
      if (!id) throw new Error('missing id')
      return getCraneProfile(id)
    },
    enabled: Boolean(id),
  })
}

/**
 * Approve с optimistic update: помечает row как approved во всех
 * кэшированных списках, потом invalidate.
 */
export function useApproveCraneProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => approveCraneProfile(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.craneProfiles })
      const snapshot = qc.getQueriesData<Paginated<CraneProfile>>({ queryKey: qk.craneProfiles })
      qc.setQueriesData<Paginated<CraneProfile>>({ queryKey: qk.craneProfiles }, (old) => {
        if (!old || !Array.isArray((old as Paginated<CraneProfile>).items)) return old
        return {
          ...old,
          items: old.items.map((item) =>
            item.id === id ? { ...item, approvalStatus: 'approved' as const } : item,
          ),
        }
      })
      return { snapshot }
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.snapshot) return
      for (const [key, data] of ctx.snapshot) {
        qc.setQueryData(key, data)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.craneProfiles })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useRejectCraneProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectCraneProfile(id, reason),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.craneProfiles })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}
