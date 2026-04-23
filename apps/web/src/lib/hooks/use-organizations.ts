'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ListOrganizationsQuery,
  type UpdateOrganizationInput,
  activateOrganization,
  archiveOrganization,
  createOrganization,
  getOrganization,
  listOrganizations,
  suspendOrganization,
  updateOrganization,
} from '../api/organizations'
import type { CreateOrganizationInput } from '../api/types'
import { qk } from '../query-keys'

export function useOrganizations(query: ListOrganizationsQuery = {}) {
  return useQuery({
    queryKey: qk.organizationsList(query),
    queryFn: () => listOrganizations(query),
  })
}

export function useOrganizationsInfinite(query: Omit<ListOrganizationsQuery, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: qk.organizationsInfinite(query),
    queryFn: ({ pageParam }) =>
      listOrganizations({ ...query, cursor: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  })
}

export function useOrganization(id: string | null) {
  return useQuery({
    queryKey: id ? qk.organizationDetail(id) : ['organizations', 'detail', 'disabled'],
    queryFn: () => {
      if (!id) throw new Error('missing id')
      return getOrganization(id)
    },
    enabled: Boolean(id),
  })
}

export function useCreateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOrganizationInput) => createOrganization(input),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.organizations })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useSuspendOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => suspendOrganization(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.organizations })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useActivateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => activateOrganization(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.organizations })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useArchiveOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archiveOrganization(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.organizations })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}

export function useUpdateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateOrganizationInput }) =>
      updateOrganization(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(qk.organizationDetail(updated.id), updated)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.organizations })
    },
  })
}
