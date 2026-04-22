'use client'

import { useQuery } from '@tanstack/react-query'
import { listRecentAudit } from '../api/audit'
import { qk } from '../query-keys'

/**
 * Hook для Recent Activity feed на dashboard. Default limit=20
 * (компактный feed, не исторический). staleTime 30s — события append-only,
 * часто рефрешить незачем.
 */
export function useRecentAudit(limit = 20) {
  return useQuery({
    queryKey: qk.auditRecent(limit),
    queryFn: () => listRecentAudit({ limit }),
    staleTime: 30_000,
  })
}
