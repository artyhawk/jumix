import type { CraneProfile } from '@jumix/shared'
import { apiFetch } from './client'

export type LicenseContentType = 'image/jpeg' | 'image/png' | 'application/pdf'

export interface RequestUploadUrlPayload {
  contentType: LicenseContentType
  filename: string
}

export interface RequestUploadUrlResponse {
  uploadUrl: string
  key: string
  version: number
  headers: Record<string, string>
  /** Presigned URL expiry (ISO) — НЕ license expiry. Client игнорирует. */
  expiresAt: string
}

export interface ConfirmLicensePayload {
  key: string
  /** ISO date или datetime — backend coerce'ит в Date. */
  expiresAt: string
}

/**
 * POST /api/v1/crane-profiles/me/license/upload-url
 * Requires approvalStatus='approved' (backend enforces).
 * Response.headers MUST forward на PUT step — MinIO signature requires.
 */
export function requestLicenseUploadUrl(
  payload: RequestUploadUrlPayload,
): Promise<RequestUploadUrlResponse> {
  return apiFetch<RequestUploadUrlResponse>('/api/v1/crane-profiles/me/license/upload-url', {
    method: 'POST',
    body: payload,
  })
}

/**
 * POST /api/v1/crane-profiles/me/license/confirm
 * Finalizes upload — backend HEAD'ает object, валидирует prefix/content-type/size,
 * атомарно обновляет crane_profile (license_key/_expires_at/_version), сбрасывает
 * warning flags. Returns updated CraneProfile (без phone — нужно refetch /me).
 */
export function confirmLicense(payload: ConfirmLicensePayload): Promise<CraneProfile> {
  return apiFetch<CraneProfile>('/api/v1/crane-profiles/me/license/confirm', {
    method: 'POST',
    body: payload,
  })
}
