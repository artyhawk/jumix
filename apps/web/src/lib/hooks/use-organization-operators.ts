'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ListOrganizationOperatorsQuery,
  approveOrganizationOperator,
  getOrganizationOperator,
  listOrganizationOperators,
  rejectOrganizationOperator,
} from '../api/organization-operators'
import type { OrganizationOperator, Paginated } from '../api/types'
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
