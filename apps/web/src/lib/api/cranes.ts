import { apiFetch } from './client'
import type { ApprovalFilter, Crane, CraneOperationalStatus, CraneType, Paginated } from './types'

export interface ListCranesQuery {
  cursor?: string
  limit?: number
  search?: string
  approvalStatus?: ApprovalFilter
  status?: CraneOperationalStatus | 'all'
  organizationId?: string
}

export interface CreateCraneInput {
  type: CraneType
  model: string
  inventoryNumber?: string
  capacityTon: number
  boomLengthM?: number
  yearManufactured?: number
  notes?: string
}

export interface UpdateCraneInput {
  type?: CraneType
  model?: string
  inventoryNumber?: string | null
  capacityTon?: number
  boomLengthM?: number | null
  yearManufactured?: number | null
  notes?: string | null
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

export function createCrane(input: CreateCraneInput) {
  return apiFetch<Crane>('/api/v1/cranes', { method: 'POST', body: input })
}

export function updateCrane(id: string, patch: UpdateCraneInput) {
  return apiFetch<Crane>(`/api/v1/cranes/${id}`, { method: 'PATCH', body: patch })
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

export function assignCraneToSite(id: string, siteId: string) {
  return apiFetch<Crane>(`/api/v1/cranes/${id}/assign-site`, {
    method: 'POST',
    body: { siteId },
  })
}

export function unassignCraneFromSite(id: string) {
  return apiFetch<Crane>(`/api/v1/cranes/${id}/unassign-site`, { method: 'POST' })
}

export function activateCrane(id: string) {
  return apiFetch<Crane>(`/api/v1/cranes/${id}/activate`, { method: 'POST' })
}

export function setCraneMaintenance(id: string) {
  return apiFetch<Crane>(`/api/v1/cranes/${id}/maintenance`, { method: 'POST' })
}

export function retireCrane(id: string) {
  return apiFetch<Crane>(`/api/v1/cranes/${id}/retire`, { method: 'POST' })
}

export function resubmitCrane(id: string) {
  return apiFetch<Crane>(`/api/v1/cranes/${id}/resubmit`, { method: 'POST' })
}
