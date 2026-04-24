import type {
  AvailableCrane,
  EndShiftPayload,
  IngestPingsPayload,
  IngestPingsResponse,
  ShiftPath,
  ShiftWithRelations,
  StartShiftPayload,
} from '@jumix/shared'
import { apiFetch } from './client'

/**
 * Mobile shifts API client (M4). Wrappers над /api/v1/shifts/* для operator.
 */

export interface Paginated<T> {
  items: T[]
  nextCursor: string | null
}

export interface ListMyShiftsQuery {
  cursor?: string
  limit?: number
}

export async function getMyActiveShift(): Promise<ShiftWithRelations | null> {
  return apiFetch<ShiftWithRelations | null>('/api/v1/shifts/my/active')
}

export async function listMyShifts(
  query: ListMyShiftsQuery = {},
): Promise<Paginated<ShiftWithRelations>> {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return apiFetch<Paginated<ShiftWithRelations>>(`/api/v1/shifts/my${qs ? `?${qs}` : ''}`)
}

export async function getShift(id: string): Promise<ShiftWithRelations> {
  return apiFetch<ShiftWithRelations>(`/api/v1/shifts/${id}`)
}

export async function getAvailableCranes(): Promise<{ items: AvailableCrane[] }> {
  return apiFetch<{ items: AvailableCrane[] }>('/api/v1/shifts/available-cranes')
}

export async function startShift(payload: StartShiftPayload): Promise<ShiftWithRelations> {
  return apiFetch<ShiftWithRelations>('/api/v1/shifts/start', {
    method: 'POST',
    body: payload,
  })
}

export async function pauseShift(id: string): Promise<ShiftWithRelations> {
  return apiFetch<ShiftWithRelations>(`/api/v1/shifts/${id}/pause`, { method: 'POST' })
}

export async function resumeShift(id: string): Promise<ShiftWithRelations> {
  return apiFetch<ShiftWithRelations>(`/api/v1/shifts/${id}/resume`, { method: 'POST' })
}

export async function endShift(
  id: string,
  payload: EndShiftPayload = {},
): Promise<ShiftWithRelations> {
  return apiFetch<ShiftWithRelations>(`/api/v1/shifts/${id}/end`, {
    method: 'POST',
    body: payload,
  })
}

// ---------- M5-b: GPS pings (ADR 0007) ----------

/**
 * Batch-ingest до 100 pings. Server partial-reject'ит невалидные (future
 * timestamps, stale), valid — инсертит. Client marks synced только
 * accepted'ы (по порядку); rejected retry'ить не пытаемся — они навсегда
 * invalid.
 */
export async function ingestPings(
  shiftId: string,
  payload: IngestPingsPayload,
): Promise<IngestPingsResponse> {
  return apiFetch<IngestPingsResponse>(`/api/v1/shifts/${shiftId}/pings`, {
    method: 'POST',
    body: payload,
  })
}

/**
 * Shift path — все pings смены ASC. sampleRate=N downsample'ит для
 * polyline rendering (500 pings / 5 = 100 points). Используется на
 * shift detail screen после end.
 */
export async function getShiftPath(shiftId: string, sampleRate?: number): Promise<ShiftPath> {
  const qs = sampleRate && sampleRate > 1 ? `?sampleRate=${sampleRate}` : ''
  return apiFetch<ShiftPath>(`/api/v1/shifts/${shiftId}/path${qs}`)
}
