import { apiFetch } from './client'
import type { ApprovalFilter, CraneProfile, Paginated } from './types'

export interface ListCraneProfilesQuery {
  cursor?: string
  limit?: number
  search?: string
  approvalStatus?: ApprovalFilter
}

export function listCraneProfiles(query: ListCraneProfilesQuery = {}) {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.search) params.set('search', query.search)
  if (query.approvalStatus && query.approvalStatus !== 'all') {
    params.set('approvalStatus', query.approvalStatus)
  }
  const qs = params.toString()
  return apiFetch<Paginated<CraneProfile>>(`/api/v1/crane-profiles${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  })
}

export function getCraneProfile(id: string) {
  return apiFetch<CraneProfile>(`/api/v1/crane-profiles/${id}`, { method: 'GET' })
}

export function approveCraneProfile(id: string) {
  return apiFetch<CraneProfile>(`/api/v1/crane-profiles/${id}/approve`, { method: 'POST' })
}

export function rejectCraneProfile(id: string, reason: string) {
  return apiFetch<CraneProfile>(`/api/v1/crane-profiles/${id}/reject`, {
    method: 'POST',
    body: { reason },
  })
}
