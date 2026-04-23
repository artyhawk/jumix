import { ApiError, NetworkError } from '@/lib/api/errors'
import { getMeStatus } from '@/lib/api/me'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export const ME_STATUS_QUERY_KEY = ['me', 'status'] as const

/**
 * `/me/status` — single source для operator UI (landing + memberships +
 * license screens).
 *
 * staleTime 60s: operator запрашивает экран редко (primary surface —
 * shifts/GPS, M4+). 1 минуты достаточно чтобы избежать лишних round-trip'ов
 * при быстром переключении screens.
 *
 * Retry logic mobile-aware:
 *  - NetworkError (offline / DNS / fetch threw) — retry до 3 раз с
 *    exponential backoff (user мог быть в лифте / метро — 2s → 4s → 8s).
 *  - ApiError 401 — НЕ retry (apiFetch single-flight refresh уже попытался,
 *    если попали сюда — refresh тоже failed, пусть auth UI перехватит).
 *  - Остальные ошибки — default RQ retry-count 2.
 */
export function useMeStatus() {
  return useQuery({
    queryKey: ME_STATUS_QUERY_KEY,
    queryFn: getMeStatus,
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof NetworkError) return failureCount < 3
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  })
}

/** Принудительный refetch (pull-to-refresh, post-mutation invalidation). */
export function useInvalidateMeStatus() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ME_STATUS_QUERY_KEY })
}
