import type {
  AvailableCrane,
  EndShiftPayload,
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
