'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { confirmLicense, getMeStatus, requestLicenseUploadUrl } from '../api/crane-profiles'
import { isAppError } from '../api/errors'
import { qk } from '../query-keys'

/**
 * /me/status — single source-of-truth для operator web cabinet (B3-UI-4).
 * staleTime 60s: operator открывает web cabinet изредка (primary surface —
 * mobile app), 1 min достаточно без лишних round-trip'ов.
 */
export function useMeStatus() {
  return useQuery({
    queryKey: qk.meStatus,
    queryFn: () => getMeStatus(),
    staleTime: 60_000,
  })
}

export type LicenseContentType = 'image/jpeg' | 'image/png' | 'application/pdf'

const ALLOWED_LICENSE_TYPES: readonly LicenseContentType[] = [
  'image/jpeg',
  'image/png',
  'application/pdf',
]

function isAllowedLicenseType(t: string): t is LicenseContentType {
  return (ALLOWED_LICENSE_TYPES as readonly string[]).includes(t)
}

export interface UploadLicenseInput {
  file: File
  expiresAt: string
}

/**
 * Three-phase orchestration (ADR 0005):
 *   1) POST /me/license/upload-url — backend returns presigned PUT URL + key
 *   2) Client PUT к MinIO directly (file body, content-type header mirrors)
 *   3) POST /me/license/confirm — backend validates (HEAD + prefix-match) +
 *      atomic state update (incrementing licenseVersion, resetting warnings).
 *
 * Errors:
 *   - ALLOWED_LICENSE_TYPE check — client-side before request-url, throws
 *     `LICENSE_CONTENT_TYPE_INVALID` (имитирует backend error code для
 *     единого toast-handling'а)
 *   - Stage 2 fetch non-OK → throws LICENSE_UPLOAD_FAILED (network или
 *     MinIO reject); UI keeps dialog open для retry.
 *   - Stage 3 confirm может bounce по LICENSE_* codes (mismatch, size) —
 *     standard AppError, surfaced через toast description.
 *
 * onSuccess invalidates meStatus — canWork + licenseStatus re-computed.
 */
export function useUploadLicense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, expiresAt }: UploadLicenseInput) => {
      if (!isAllowedLicenseType(file.type)) {
        throw Object.assign(new Error('LICENSE_CONTENT_TYPE_INVALID'), {
          code: 'LICENSE_CONTENT_TYPE_INVALID',
        })
      }
      const { uploadUrl, key, headers } = await requestLicenseUploadUrl({
        contentType: file.type,
        filename: file.name,
      })
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type, ...headers },
      })
      if (!putRes.ok) {
        throw Object.assign(new Error('LICENSE_UPLOAD_FAILED'), {
          code: 'LICENSE_UPLOAD_FAILED',
        })
      }
      return confirmLicense({ key, expiresAt })
    },
    onSuccess: () => {
      toast.success('Удостоверение загружено')
      qc.invalidateQueries({ queryKey: qk.meStatus })
    },
    onError: (err: unknown) => {
      const description = resolveUploadErrorMessage(err)
      toast.error('Не удалось загрузить удостоверение', { description })
    },
  })
}

function resolveUploadErrorMessage(err: unknown): string {
  if (isAppError(err)) {
    if (err.code === 'LICENSE_CONTENT_TYPE_INVALID') {
      return 'Недопустимый формат файла. Разрешены JPG, PNG, PDF.'
    }
    return err.message
  }
  if (err instanceof Error) {
    if (err.message === 'LICENSE_UPLOAD_FAILED') {
      return 'Загрузка прервалась. Проверьте соединение и попробуйте ещё раз.'
    }
    if (err.message === 'LICENSE_CONTENT_TYPE_INVALID') {
      return 'Недопустимый формат файла. Разрешены JPG, PNG, PDF.'
    }
  }
  return 'Попробуйте ещё раз'
}
