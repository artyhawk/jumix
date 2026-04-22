import { apiFetch } from './client'
import type { RecentAuditResponse } from './types'

/**
 * GET /api/v1/audit/recent — платформа-wide последние события.
 * Superadmin-only (backend policy). Default limit=50, max=100.
 */
export function listRecentAudit(params: { limit?: number } = {}): Promise<RecentAuditResponse> {
  const q = new URLSearchParams()
  if (params.limit !== undefined) q.set('limit', String(params.limit))
  const qs = q.toString()
  return apiFetch<RecentAuditResponse>(`/api/v1/audit/recent${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  })
}
