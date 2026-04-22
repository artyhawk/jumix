'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type CreateCraneInput,
  type ListCranesQuery,
  type UpdateCraneInput,
  activateCrane,
  approveCrane,
  assignCraneToSite,
  createCrane,
  getCrane,
  listCranes,
  rejectCrane,
  resubmitCrane,
  retireCrane,
  setCraneMaintenance,
  unassignCraneFromSite,
  updateCrane,
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

/**
 * После любой mutation на crane — invalidate cranes-prefix (все списки/detail)
 * + dashboard (counts могут поменяться). Optimistic patch'и применяются точечно
 * в onMutate, на rollback читается snapshot из onError.
 */
function invalidateCranes(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.cranes })
  qc.invalidateQueries({ queryKey: qk.dashboard })
}

export function useCreateCrane() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCraneInput) => createCrane(input),
    onSettled: () => invalidateCranes(qc),
  })
}

export function useUpdateCrane() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateCraneInput }) => updateCrane(id, patch),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: qk.cranes })
      qc.invalidateQueries({ queryKey: qk.craneDetail(vars.id) })
    },
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
    onSettled: () => invalidateCranes(qc),
  })
}

export function useRejectCrane() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectCrane(id, reason),
    onSettled: () => invalidateCranes(qc),
  })
}

export function useAssignCraneToSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, siteId }: { id: string; siteId: string }) => assignCraneToSite(id, siteId),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: qk.cranes })
      qc.invalidateQueries({ queryKey: qk.craneDetail(vars.id) })
    },
  })
}

export function useUnassignCraneFromSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unassignCraneFromSite(id),
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: qk.cranes })
      qc.invalidateQueries({ queryKey: qk.craneDetail(id) })
    },
  })
}

export function useActivateCrane() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => activateCrane(id),
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: qk.cranes })
      qc.invalidateQueries({ queryKey: qk.craneDetail(id) })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useSetCraneMaintenance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => setCraneMaintenance(id),
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: qk.cranes })
      qc.invalidateQueries({ queryKey: qk.craneDetail(id) })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useRetireCrane() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => retireCrane(id),
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: qk.cranes })
      qc.invalidateQueries({ queryKey: qk.craneDetail(id) })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useResubmitCrane() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => resubmitCrane(id),
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: qk.cranes })
      qc.invalidateQueries({ queryKey: qk.craneDetail(id) })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}
