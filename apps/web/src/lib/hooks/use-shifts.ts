'use client'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { type ListOwnerShiftsQuery, getShift, listOwnerShifts } from '../api/shifts'
import { qk } from '../query-keys'

/**
 * Web shift queries (M4). Owner/superadmin surface (site drawer active shifts,
 * optional /shifts list в backlog). Polling каждые 30s — real-time feel для
 * dashboard без WebSocket'а.
 */

export function useOwnerShiftsInfinite(query: Omit<ListOwnerShiftsQuery, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: qk.shiftsOwnerInfinite(query),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listOwnerShifts({ ...query, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

/**
 * Фиксированный query (не infinite) — удобнее для hooks на drawer-уровне,
 * где нужно просто живое состояние без pagination UX.
 */
export function useOwnerShifts(query: ListOwnerShiftsQuery = {}) {
  return useQuery({
    queryKey: qk.shiftsOwner(query),
    queryFn: () => listOwnerShifts(query),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

export function useShiftDetail(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.shiftDetail(id) : ['shifts', 'detail', 'disabled'],
    queryFn: () => {
      if (!id) throw new Error('shift id is undefined')
      return getShift(id)
    },
    enabled: Boolean(id),
  })
}
