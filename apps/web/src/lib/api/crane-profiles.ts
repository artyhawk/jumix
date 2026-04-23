import { apiFetch } from './client'
import type {
  ApprovalFilter,
  CraneProfile,
  LicenseStatus,
  MeStatusResponse,
  Paginated,
} from './types'

export type LicenseStatusFilter = LicenseStatus | 'all'

export interface ListCraneProfilesQuery {
  cursor?: string
  limit?: number
  search?: string
  approvalStatus?: ApprovalFilter
  // licenseStatus фильтруется клиентом на загруженной странице — backend
  // computed на boundary, сервер-side фильтр — в backlog (см. web-architecture).
  licenseStatus?: LicenseStatusFilter
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

// ---------- Operator self-endpoints (B3-UI-4) ----------

/**
 * /me/status — single source-of-truth для operator web cabinet. Возвращает
 * profile + memberships + licenseStatus + canWork + canWorkReasons.
 */
export function getMeStatus() {
  return apiFetch<MeStatusResponse>('/api/v1/crane-profiles/me/status', { method: 'GET' })
}

export interface LicenseUploadUrlRequest {
  contentType: 'image/jpeg' | 'image/png' | 'application/pdf'
  filename: string
}

export interface LicenseUploadUrlResponse {
  uploadUrl: string
  key: string
  version: number
  headers: Record<string, string>
  expiresAt: string
}

export function requestLicenseUploadUrl(body: LicenseUploadUrlRequest) {
  return apiFetch<LicenseUploadUrlResponse>('/api/v1/crane-profiles/me/license/upload-url', {
    method: 'POST',
    body,
  })
}

export interface ConfirmLicenseRequest {
  key: string
  expiresAt: string
}

export function confirmLicense(body: ConfirmLicenseRequest) {
  return apiFetch<CraneProfile>('/api/v1/crane-profiles/me/license/confirm', {
    method: 'POST',
    body,
  })
}
