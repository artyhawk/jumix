import { apiFetch } from './client'
import type {
  CreateIncidentPayload,
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  IncidentWithRelations,
  Paginated,
  RequestPhotoUploadUrlPayload,
  RequestPhotoUploadUrlResponse,
} from './types'

/**
 * Incidents API client (M6, ADR 0008).
 */

export interface ListOwnerIncidentsQuery {
  cursor?: string
  limit?: number
  status?: IncidentStatus
  severity?: IncidentSeverity
  type?: IncidentType
  siteId?: string
  craneId?: string
}

export function listOwnerIncidents(query: ListOwnerIncidentsQuery = {}) {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.status) params.set('status', query.status)
  if (query.severity) params.set('severity', query.severity)
  if (query.type) params.set('type', query.type)
  if (query.siteId) params.set('siteId', query.siteId)
  if (query.craneId) params.set('craneId', query.craneId)
  const qs = params.toString()
  return apiFetch<Paginated<IncidentWithRelations>>(
    `/api/v1/incidents/owner${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  )
}

export function listMyIncidents(query: { cursor?: string; limit?: number } = {}) {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return apiFetch<Paginated<IncidentWithRelations>>(`/api/v1/incidents/my${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  })
}

export function getIncident(id: string) {
  return apiFetch<IncidentWithRelations>(`/api/v1/incidents/${id}`, { method: 'GET' })
}

export function createIncident(payload: CreateIncidentPayload) {
  return apiFetch<Incident>('/api/v1/incidents', { method: 'POST', body: payload })
}

export function requestIncidentPhotoUploadUrl(payload: RequestPhotoUploadUrlPayload) {
  return apiFetch<RequestPhotoUploadUrlResponse>('/api/v1/incidents/photos/upload-url', {
    method: 'POST',
    body: payload,
  })
}

export function acknowledgeIncident(id: string) {
  return apiFetch<Incident>(`/api/v1/incidents/${id}/acknowledge`, { method: 'POST' })
}

export function resolveIncident(id: string, notes?: string) {
  return apiFetch<Incident>(`/api/v1/incidents/${id}/resolve`, {
    method: 'POST',
    body: notes ? { notes } : {},
  })
}

export function escalateIncident(id: string, notes?: string) {
  return apiFetch<Incident>(`/api/v1/incidents/${id}/escalate`, {
    method: 'POST',
    body: notes ? { notes } : {},
  })
}

export function deEscalateIncident(id: string) {
  return apiFetch<Incident>(`/api/v1/incidents/${id}/de-escalate`, { method: 'POST' })
}
