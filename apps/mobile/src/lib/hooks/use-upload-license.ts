import { ApiError } from '@/lib/api/errors'
import { type LicenseContentType, confirmLicense, requestLicenseUploadUrl } from '@/lib/api/license'
import { toast } from '@/lib/toast'
import { uploadFileWithProgress } from '@/lib/upload'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ME_STATUS_QUERY_KEY } from './use-me'

export class LicenseUploadFailedError extends Error {
  constructor() {
    super('LICENSE_UPLOAD_FAILED')
    this.name = 'LicenseUploadFailedError'
  }
}

export interface UploadLicenseInput {
  fileUri: string
  fileName: string
  mimeType: LicenseContentType
  /** ISO date (YYYY-MM-DD) — backend coerces to Date + validates future + ≤20 лет. */
  expiresAt: string
}

/**
 * Three-phase orchestration (ADR 0005 mirror web B3-UI-4):
 *   1) requestLicenseUploadUrl → presigned PUT + headers
 *   2) FileSystem.createUploadTask PUT файла к MinIO (с progress callback)
 *   3) confirmLicense → backend HEAD + validate + persist
 *
 * Progress state отдельный от mutation.isPending — показывает 0..1 fraction
 * во время phase 2 (typically 70% wall-clock для phone network).
 *
 * onSuccess → invalidate ['me', 'status'] → canWork + licenseStatus re-computed
 * → UI reflects новую license автоматически (/me + /license screens).
 */
export function useUploadLicense() {
  const [progress, setProgress] = useState(0)
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: UploadLicenseInput) => {
      setProgress(0)

      // Phase 1: presigned URL
      const presigned = await requestLicenseUploadUrl({
        contentType: input.mimeType,
        filename: input.fileName,
      })

      // Phase 2: PUT к MinIO с progress
      const uploadResult = await uploadFileWithProgress({
        uri: input.fileUri,
        uploadUrl: presigned.uploadUrl,
        contentType: input.mimeType,
        headers: presigned.headers,
        onProgress: setProgress,
      })

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new LicenseUploadFailedError()
      }

      // Phase 3: confirm (backend валидирует и persist'ит)
      return confirmLicense({
        key: presigned.key,
        expiresAt: input.expiresAt,
      })
    },
    onSuccess: () => {
      toast({ title: 'Удостоверение загружено', preset: 'done' })
      void qc.invalidateQueries({ queryKey: ME_STATUS_QUERY_KEY })
      setProgress(0)
    },
    onError: (err: unknown) => {
      toast({
        title: 'Ошибка загрузки',
        message: resolveErrorMessage(err),
        preset: 'error',
      })
      setProgress(0)
    },
  })

  return {
    upload: mutation.mutate,
    uploadAsync: mutation.mutateAsync,
    isUploading: mutation.isPending,
    progress,
    error: mutation.error,
    reset: () => {
      mutation.reset()
      setProgress(0)
    },
  }
}

function resolveErrorMessage(err: unknown): string {
  if (err instanceof LicenseUploadFailedError) {
    return 'Не удалось загрузить файл на сервер. Проверьте соединение.'
  }
  if (err instanceof ApiError) {
    if (err.code === 'LICENSE_CONTENT_TYPE_INVALID') {
      return 'Недопустимый формат файла (разрешены JPG, PNG, PDF).'
    }
    if (err.code === 'CRANE_PROFILE_NOT_APPROVED') {
      return 'Профиль ещё не одобрен — загрузка будет доступна после одобрения.'
    }
    return err.message
  }
  return 'Попробуйте ещё раз'
}
