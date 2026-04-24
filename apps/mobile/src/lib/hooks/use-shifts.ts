import { ApiError, NetworkError } from '@/lib/api/errors'
import {
  endShift,
  getAvailableCranes,
  getMyActiveShift,
  getShift,
  listMyShifts,
  pauseShift,
  resumeShift,
  startShift,
} from '@/lib/api/shifts'
import type { EndShiftPayload, ShiftWithRelations, StartShiftPayload } from '@jumix/shared'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

/**
 * Mobile shift hooks (M4). Operator-only.
 *
 * `useMyActiveShift` — 30s polling чтобы ловить backend-initiated state
 * changes (superadmin force-end, manual DB ops). Retry policy mobile-aware,
 * та же что для useMeStatus (NetworkError → 3 retries exp backoff).
 */

export const SHIFTS_QUERY_ROOT = ['shifts'] as const
export const MY_ACTIVE_SHIFT_KEY = ['shifts', 'my', 'active'] as const
export const AVAILABLE_CRANES_KEY = ['shifts', 'available-cranes'] as const
export const MY_SHIFTS_HISTORY_KEY = ['shifts', 'my', 'history'] as const
export const SHIFT_DETAIL_KEY = (id: string) => ['shifts', 'detail', id] as const

function mobileRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof NetworkError) return failureCount < 3
  if (error instanceof ApiError && error.status === 401) return false
  return failureCount < 2
}
const mobileRetryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000)

export function useMyActiveShift() {
  return useQuery({
    queryKey: MY_ACTIVE_SHIFT_KEY,
    queryFn: getMyActiveShift,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: mobileRetry,
    retryDelay: mobileRetryDelay,
  })
}

export function useAvailableCranes() {
  return useQuery({
    queryKey: AVAILABLE_CRANES_KEY,
    queryFn: getAvailableCranes,
    staleTime: 30_000,
    retry: mobileRetry,
    retryDelay: mobileRetryDelay,
  })
}

export function useMyShiftsHistory() {
  return useInfiniteQuery({
    queryKey: MY_SHIFTS_HISTORY_KEY,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listMyShifts({ cursor: pageParam, limit: 20 }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
    retry: mobileRetry,
    retryDelay: mobileRetryDelay,
  })
}

export function useShiftDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: id ? SHIFT_DETAIL_KEY(id) : ['shifts', 'detail', 'disabled'],
    queryFn: () => {
      if (!id) throw new Error('shift id is required')
      return getShift(id)
    },
    enabled: Boolean(id),
    retry: mobileRetry,
    retryDelay: mobileRetryDelay,
  })
}

/**
 * Invalidation strategy для mutations: все shifts queries +/me/status
 * (canWork re-evaluation не нужен, но /me может использовать operator-id
 * lookup в будущем). dashboard + memberships не трогаем — они не зависят
 * от shift state.
 */
function invalidateShiftQueries(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: SHIFTS_QUERY_ROOT })
}

export function useStartShift() {
  const qc = useQueryClient()
  return useMutation<ShiftWithRelations, unknown, StartShiftPayload>({
    mutationFn: (payload) => startShift(payload),
    onSuccess: () => invalidateShiftQueries(qc),
  })
}

export function usePauseShift() {
  const qc = useQueryClient()
  return useMutation<ShiftWithRelations, unknown, string>({
    mutationFn: (id) => pauseShift(id),
    onSuccess: (data) => {
      qc.setQueryData(MY_ACTIVE_SHIFT_KEY, data)
      invalidateShiftQueries(qc)
    },
  })
}

export function useResumeShift() {
  const qc = useQueryClient()
  return useMutation<ShiftWithRelations, unknown, string>({
    mutationFn: (id) => resumeShift(id),
    onSuccess: (data) => {
      qc.setQueryData(MY_ACTIVE_SHIFT_KEY, data)
      invalidateShiftQueries(qc)
    },
  })
}

export function useEndShift() {
  const qc = useQueryClient()
  return useMutation<ShiftWithRelations, unknown, { id: string; payload?: EndShiftPayload }>({
    mutationFn: ({ id, payload }) => endShift(id, payload ?? {}),
    onSuccess: () => {
      // active shift исчез — explicit null чтобы UI не показывал stale card.
      qc.setQueryData(MY_ACTIVE_SHIFT_KEY, null)
      invalidateShiftQueries(qc)
    },
  })
}
