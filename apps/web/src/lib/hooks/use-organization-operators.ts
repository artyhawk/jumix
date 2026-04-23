'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type CreateHireRequestPayload,
  type ListOrganizationOperatorsQuery,
  activateOrganizationOperator,
  approveOrganizationOperator,
  blockOrganizationOperator,
  createHireRequest,
  getOrganizationOperator,
  listOrganizationOperators,
  rejectOrganizationOperator,
  terminateOrganizationOperator,
} from '../api/organization-operators'
import type { OperatorHireStatus, OrganizationOperator, Paginated } from '../api/types'
import { qk } from '../query-keys'

export function useOrganizationOperators(query: ListOrganizationOperatorsQuery = {}) {
  return useQuery({
    queryKey: qk.organizationOperatorsList(query),
    queryFn: () => listOrganizationOperators(query),
  })
}

export function useOrganizationOperatorsInfinite(
  query: Omit<ListOrganizationOperatorsQuery, 'cursor'> = {},
) {
  return useInfiniteQuery({
    queryKey: qk.organizationOperatorsInfinite(query),
    queryFn: ({ pageParam }) =>
      listOrganizationOperators({ ...query, cursor: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  })
}

export function useOrganizationOperator(id: string | null) {
  return useQuery({
    queryKey: id
      ? qk.organizationOperatorDetail(id)
      : ['organization-operators', 'detail', 'disabled'],
    queryFn: () => {
      if (!id) throw new Error('missing id')
      return getOrganizationOperator(id)
    },
    enabled: Boolean(id),
  })
}

export function useApproveOrganizationOperator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => approveOrganizationOperator(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.organizationOperators })
      const snapshot = qc.getQueriesData<Paginated<OrganizationOperator>>({
        queryKey: qk.organizationOperators,
      })
      qc.setQueriesData<Paginated<OrganizationOperator>>(
        { queryKey: qk.organizationOperators },
        (old) => {
          if (!old || !Array.isArray((old as Paginated<OrganizationOperator>).items)) return old
          return {
            ...old,
            items: old.items.map((item) =>
              item.id === id ? { ...item, approvalStatus: 'approved' as const } : item,
            ),
          }
        },
      )
      return { snapshot }
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.snapshot) return
      for (const [key, data] of ctx.snapshot) {
        qc.setQueryData(key, data)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.organizationOperators })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useRejectOrganizationOperator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectOrganizationOperator(id, reason),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.organizationOperators })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useCreateHireRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateHireRequestPayload) => createHireRequest(payload),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.organizationOperators })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

/**
 * Optimistic status-flip для hire (active/blocked/terminated). Rollback на
 * error — восстанавливаем snapshot всех hire-query'ов. Invalidate после
 * settle: список + detail + dashboard.
 */
function buildOptimisticStatusMutation(
  mutationFn: (id: string) => Promise<OrganizationOperator>,
  nextStatus: OperatorHireStatus,
) {
  return (qc: ReturnType<typeof useQueryClient>) => ({
    mutationFn: (id: string) => mutationFn(id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: qk.organizationOperators })
      const snapshot = qc.getQueriesData<Paginated<OrganizationOperator>>({
        queryKey: qk.organizationOperators,
      })
      qc.setQueriesData<Paginated<OrganizationOperator>>(
        { queryKey: qk.organizationOperators },
        (old) => {
          if (!old || !Array.isArray((old as Paginated<OrganizationOperator>).items)) return old
          return {
            ...old,
            items: old.items.map((item) =>
              item.id === id ? { ...item, status: nextStatus } : item,
            ),
          }
        },
      )
      return { snapshot }
    },
    onError: (
      _err: unknown,
      _vars: string,
      ctx: { snapshot: Array<[unknown, unknown]> } | undefined,
    ) => {
      if (!ctx?.snapshot) return
      for (const [key, data] of ctx.snapshot) {
        qc.setQueryData(key as readonly unknown[], data)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.organizationOperators })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useBlockOrganizationOperator() {
  const qc = useQueryClient()
  // Block поддерживает optional reason — variant c reason идёт через отдельный
  // shape, rollback-паттерн тот же.
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      blockOrganizationOperator(id, reason),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: qk.organizationOperators })
      const snapshot = qc.getQueriesData<Paginated<OrganizationOperator>>({
        queryKey: qk.organizationOperators,
      })
      qc.setQueriesData<Paginated<OrganizationOperator>>(
        { queryKey: qk.organizationOperators },
        (old) => {
          if (!old || !Array.isArray((old as Paginated<OrganizationOperator>).items)) return old
          return {
            ...old,
            items: old.items.map((item) =>
              item.id === id ? { ...item, status: 'blocked' as const } : item,
            ),
          }
        },
      )
      return { snapshot }
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.snapshot) return
      for (const [key, data] of ctx.snapshot) {
        qc.setQueryData(key, data)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.organizationOperators })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useActivateOrganizationOperator() {
  const qc = useQueryClient()
  return useMutation(buildOptimisticStatusMutation(activateOrganizationOperator, 'active')(qc))
}

export function useTerminateOrganizationOperator() {
  const qc = useQueryClient()
  return useMutation(buildOptimisticStatusMutation(terminateOrganizationOperator, 'terminated')(qc))
}
