import type {
  CreateIncidentPayload,
  Incident,
  IncidentWithRelations,
  RequestPhotoUploadUrlPayload,
  RequestPhotoUploadUrlResponse,
} from '@jumix/shared'
import { apiFetch } from './client'

/**
 * Mobile incidents API client (M6, ADR 0008). Operator-facing — own
 * incidents history + create flow.
 */

export interface Paginated<T> {
  items: T[]
  nextCursor: string | null
}

export interface ListMyIncidentsQuery {
  cursor?: string
  limit?: number
}

export function listMyIncidents(
  query: ListMyIncidentsQuery = {},
): Promise<Paginated<IncidentWithRelations>> {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return apiFetch<Paginated<IncidentWithRelations>>(`/api/v1/incidents/my${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  })
}

export function getIncident(id: string): Promise<IncidentWithRelations> {
  return apiFetch<IncidentWithRelations>(`/api/v1/incidents/${id}`, { method: 'GET' })
}

export function createIncident(payload: CreateIncidentPayload): Promise<Incident> {
  return apiFetch<Incident>('/api/v1/incidents', {
    method: 'POST',
    body: payload,
  })
}

/**
 * POST /api/v1/incidents/photos/upload-url — operator-only presigned PUT.
 * Returned headers MUST forward на PUT step (MinIO signature requires).
 */
export function requestIncidentPhotoUploadUrl(
  payload: RequestPhotoUploadUrlPayload,
): Promise<RequestPhotoUploadUrlResponse> {
  return apiFetch<RequestPhotoUploadUrlResponse>('/api/v1/incidents/photos/upload-url', {
    method: 'POST',
    body: payload,
  })
}

/**
 * POST /api/v1/checklists/photos/upload-url — operator-only presigned PUT
 * для photos прилагаемых к checklist items в shift.start.
 */
export function requestChecklistPhotoUploadUrl(
  payload: RequestPhotoUploadUrlPayload,
): Promise<RequestPhotoUploadUrlResponse> {
  return apiFetch<RequestPhotoUploadUrlResponse>('/api/v1/checklists/photos/upload-url', {
    method: 'POST',
    body: payload,
  })
}
