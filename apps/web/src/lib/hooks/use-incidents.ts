'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ListOwnerIncidentsQuery,
  acknowledgeIncident,
  deEscalateIncident,
  escalateIncident,
  getIncident,
  listOwnerIncidents,
  resolveIncident,
} from '../api/incidents'
import { qk } from '../query-keys'

/**
 * Web hooks для incidents (M6, ADR 0008). Owner/superadmin surface — operator
 * не пользуется web для incident reporting, его flow в mobile.
 *
 * После любой mutation invalidate'им incidents prefix + dashboard
 * (pending.incidents counter обновляется при resolve/escalate).
 */

export function useOwnerIncidents(query: ListOwnerIncidentsQuery = {}) {
  return useQuery({
    queryKey: qk.incidentsOwner(query),
    queryFn: () => listOwnerIncidents(query),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

export function useOwnerIncidentsInfinite(query: Omit<ListOwnerIncidentsQuery, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: qk.incidentsOwnerInfinite(query),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listOwnerIncidents({ ...query, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  })
}

export function useIncident(id: string | null) {
  return useQuery({
    queryKey: id ? qk.incidentDetail(id) : ['incidents', 'detail', 'disabled'],
    queryFn: () => {
      if (!id) throw new Error('missing id')
      return getIncident(id)
    },
    enabled: Boolean(id),
  })
}

function invalidateIncidents(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: qk.incidents })
  qc.invalidateQueries({ queryKey: qk.dashboard })
  if (id) qc.invalidateQueries({ queryKey: qk.incidentDetail(id) })
}

export function useAcknowledgeIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => acknowledgeIncident(id),
    onSettled: (_data, _err, id) => invalidateIncidents(qc, id),
  })
}

export function useResolveIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => resolveIncident(id, notes),
    onSettled: (_data, _err, vars) => invalidateIncidents(qc, vars.id),
  })
}

export function useEscalateIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => escalateIncident(id, notes),
    onSettled: (_data, _err, vars) => invalidateIncidents(qc, vars.id),
  })
}

export function useDeEscalateIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deEscalateIncident(id),
    onSettled: (_data, _err, id) => invalidateIncidents(qc, id),
  })
}
