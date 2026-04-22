import { apiFetch } from './client'
import type { ApprovalFilter, Crane, CraneOperationalStatus, Paginated } from './types'

export interface ListCranesQuery {
  cursor?: string
  limit?: number
  search?: string
  approvalStatus?: ApprovalFilter
  status?: CraneOperationalStatus | 'all'
  organizationId?: string
}

export function listCranes(query: ListCranesQuery = {}) {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.search) params.set('search', query.search)
  if (query.approvalStatus && query.approvalStatus !== 'all') {
    params.set('approvalStatus', query.approvalStatus)
  }
  if (query.status && query.status !== 'all') params.set('status', query.status)
  if (query.organizationId) params.set('organizationId', query.organizationId)
  const qs = params.toString()
  return apiFetch<Paginated<Crane>>(`/api/v1/cranes${qs ? `?${qs}` : ''}`, { method: 'GET' })
}

export function getCrane(id: string) {
  return apiFetch<Crane>(`/api/v1/cranes/${id}`, { method: 'GET' })
}

export function approveCrane(id: string) {
  return apiFetch<Crane>(`/api/v1/cranes/${id}/approve`, { method: 'POST' })
}

export function rejectCrane(id: string, reason: string) {
  return apiFetch<Crane>(`/api/v1/cranes/${id}/reject`, {
    method: 'POST',
    body: { reason },
  })
}
