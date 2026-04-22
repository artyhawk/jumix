'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ListCranesQuery,
  approveCrane,
  getCrane,
  listCranes,
  rejectCrane,
} from '../api/cranes'
import type { Crane, Paginated } from '../api/types'
import { qk } from '../query-keys'

export function useCranes(query: ListCranesQuery = {}) {
  return useQuery({
    queryKey: qk.cranesList(query),
    queryFn: () => listCranes(query),
  })
}

export function useCranesInfinite(query: Omit<ListCranesQuery, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: qk.cranesInfinite(query),
    queryFn: ({ pageParam }) => listCranes({ ...query, cursor: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  })
}

export function useCrane(id: string | null) {
  return useQuery({
    queryKey: id ? qk.craneDetail(id) : ['cranes', 'detail', 'disabled'],
    queryFn: () => {
      if (!id) throw new Error('missing id')
      return getCrane(id)
    },
    enabled: Boolean(id),
  })
}

export function useApproveCrane() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => approveCrane(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.cranes })
      const snapshot = qc.getQueriesData<Paginated<Crane>>({ queryKey: qk.cranes })
      qc.setQueriesData<Paginated<Crane>>({ queryKey: qk.cranes }, (old) => {
        if (!old || !Array.isArray((old as Paginated<Crane>).items)) return old
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
      qc.invalidateQueries({ queryKey: qk.cranes })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useRejectCrane() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectCrane(id, reason),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.cranes })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}
