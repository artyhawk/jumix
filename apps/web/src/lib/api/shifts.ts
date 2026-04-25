import { apiFetch } from './client'
import type {
  ActiveShiftLocation,
  AvailableCrane,
  EndShiftPayload,
  Paginated,
  ShiftPath,
  ShiftStatus,
  ShiftWithRelations,
  StartShiftPayload,
} from './types'

/**
 * Shifts API client (M4). Wrappers над backend endpoints /api/v1/shifts/*.
 */

export interface ListOwnerShiftsQuery {
  cursor?: string
  limit?: number
  status?: ShiftStatus | 'live' | 'all'
  siteId?: string
  craneId?: string
  organizationId?: string
}

export interface ListMyShiftsQuery {
  cursor?: string
  limit?: number
}

export function listOwnerShifts(query: ListOwnerShiftsQuery = {}) {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.status) params.set('status', query.status)
  if (query.siteId) params.set('siteId', query.siteId)
  if (query.craneId) params.set('craneId', query.craneId)
  if (query.organizationId) params.set('organizationId', query.organizationId)
  const qs = params.toString()
  return apiFetch<Paginated<ShiftWithRelations>>(`/api/v1/shifts/owner${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  })
}

export function listMyShifts(query: ListMyShiftsQuery = {}) {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return apiFetch<Paginated<ShiftWithRelations>>(`/api/v1/shifts/my${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  })
}

export function getMyActiveShift() {
  return apiFetch<ShiftWithRelations | null>('/api/v1/shifts/my/active', { method: 'GET' })
}

export function getShift(id: string) {
  return apiFetch<ShiftWithRelations>(`/api/v1/shifts/${id}`, { method: 'GET' })
}

export function getAvailableCranes() {
  return apiFetch<{ items: AvailableCrane[] }>('/api/v1/shifts/available-cranes', {
    method: 'GET',
  })
}

export function startShift(payload: StartShiftPayload) {
  return apiFetch<ShiftWithRelations>('/api/v1/shifts/start', {
    method: 'POST',
    body: payload,
  })
}

export function pauseShift(id: string) {
  return apiFetch<ShiftWithRelations>(`/api/v1/shifts/${id}/pause`, { method: 'POST' })
}

export function resumeShift(id: string) {
  return apiFetch<ShiftWithRelations>(`/api/v1/shifts/${id}/resume`, { method: 'POST' })
}

export function endShift(id: string, payload: EndShiftPayload = {}) {
  return apiFetch<ShiftWithRelations>(`/api/v1/shifts/${id}/end`, {
    method: 'POST',
    body: payload,
  })
}

export interface ListLatestLocationsQuery {
  siteId?: string
}

/**
 * GET /api/v1/shifts/owner/locations-latest — last-known ping per active
 * (включая paused) shift в scope'е вызывающего (owner: своя org, superadmin:
 * все). Поле `minutesSinceLastPing` — computed server-side, используется
 * web-клиентом для stale-indicator при > 10 минут.
 */
export function listLatestLocations(query: ListLatestLocationsQuery = {}) {
  const params = new URLSearchParams()
  if (query.siteId) params.set('siteId', query.siteId)
  const qs = params.toString()
  return apiFetch<{ items: ActiveShiftLocation[] }>(
    `/api/v1/shifts/owner/locations-latest${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  )
}

/**
 * GET /api/v1/shifts/:id/path — полилиния смены. `sampleRate=N` downsample'ит
 * для длинных историй (каждый N-ый ping); default 1 = все пинги, max 20.
 */
export function getShiftPath(id: string, sampleRate = 1) {
  const params = new URLSearchParams()
  if (sampleRate !== 1) params.set('sampleRate', String(sampleRate))
  const qs = params.toString()
  return apiFetch<ShiftPath>(`/api/v1/shifts/${id}/path${qs ? `?${qs}` : ''}`, { method: 'GET' })
}
