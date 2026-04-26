import { ApiError, NetworkError } from '@/lib/api/errors'
import {
  createIncident,
  getIncident,
  listMyIncidents,
  requestIncidentPhotoUploadUrl,
} from '@/lib/api/incidents'
import { toast } from '@/lib/toast'
import { uploadFileWithProgress } from '@/lib/upload'
import type { CreateIncidentPayload, Incident, IncidentSeverity, IncidentType } from '@jumix/shared'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

/**
 * Mobile incident hooks (M6, ADR 0008). Operator-only — own list +
 * detail + create orchestration с three-phase photo upload.
 */

export const INCIDENTS_ROOT = ['incidents'] as const
export const MY_INCIDENTS_KEY = ['incidents', 'my'] as const
export const INCIDENT_DETAIL_KEY = (id: string) => ['incidents', 'detail', id] as const

function mobileRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof NetworkError) return failureCount < 3
  if (error instanceof ApiError && error.status === 401) return false
  return failureCount < 2
}
const mobileRetryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000)

export function useMyIncidents() {
  return useInfiniteQuery({
    queryKey: MY_INCIDENTS_KEY,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listMyIncidents({ cursor: pageParam, limit: 20 }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
    retry: mobileRetry,
    retryDelay: mobileRetryDelay,
  })
}

export function useIncident(id: string | null | undefined) {
  return useQuery({
    queryKey: id ? INCIDENT_DETAIL_KEY(id) : ['incidents', 'detail', 'disabled'],
    queryFn: () => {
      if (!id) throw new Error('incident id is required')
      return getIncident(id)
    },
    enabled: Boolean(id),
    retry: mobileRetry,
    retryDelay: mobileRetryDelay,
  })
}

export class IncidentPhotoUploadFailedError extends Error {
  constructor(
    public photoIndex: number,
    public httpStatus: number,
  ) {
    super('INCIDENT_PHOTO_UPLOAD_FAILED')
    this.name = 'IncidentPhotoUploadFailedError'
  }
}

export interface IncidentPhotoToUpload {
  fileUri: string
  fileName: string
  mimeType: 'image/jpeg' | 'image/png'
}

export interface CreateIncidentInput {
  type: IncidentType
  severity: IncidentSeverity
  description: string
  photos: IncidentPhotoToUpload[]
  /** Optional shift_id — auto-derive site/crane/org. */
  shiftId?: string
  /** Optional GPS — auto-attach из M5 queue если recent. */
  latitude?: number
  longitude?: number
}

export interface CreateIncidentProgress {
  /** Текущий photo index (0-based) или null если фото нет. */
  currentPhotoIndex: number | null
  /** Загружено байт текущего photo (0..1 fraction). */
  currentPhotoFraction: number
  /** Сколько фото уже загружено успешно. */
  uploadedCount: number
  /** Общее число фото. */
  totalPhotos: number
}

const INITIAL_PROGRESS: CreateIncidentProgress = {
  currentPhotoIndex: null,
  currentPhotoFraction: 0,
  uploadedCount: 0,
  totalPhotos: 0,
}

/**
 * Orchestration: для каждого фото — phase 1 (presigned URL), phase 2
 * (PUT с progress), потом phase 3 (POST /incidents с photoKeys array).
 *
 * Photos уже compressed (compressImage) до этого хука. Здесь только
 * upload + create. Если photo upload падает — abort всю operation
 * (operator повторит manually). Photos уже загруженные ранее — orphan
 * pending objects, cleanup в backlog.
 *
 * onSuccess → invalidate ['incidents','my'] + Burnt toast. Возвращает
 * created incident (без photoUrls — для list refresh достаточно
 * invalidate).
 */
export function useCreateIncident() {
  const [progress, setProgress] = useState<CreateIncidentProgress>(INITIAL_PROGRESS)
  const qc = useQueryClient()

  const mutation = useMutation<Incident, unknown, CreateIncidentInput>({
    mutationFn: async (input) => {
      setProgress({ ...INITIAL_PROGRESS, totalPhotos: input.photos.length })

      const photoKeys: string[] = []

      for (let i = 0; i < input.photos.length; i++) {
        const photo = input.photos[i]
        if (!photo) continue
        setProgress((prev) => ({
          ...prev,
          currentPhotoIndex: i,
          currentPhotoFraction: 0,
        }))

        const presigned = await requestIncidentPhotoUploadUrl({
          contentType: photo.mimeType,
          filename: photo.fileName,
        })

        const uploadResult = await uploadFileWithProgress({
          uri: photo.fileUri,
          uploadUrl: presigned.uploadUrl,
          contentType: photo.mimeType,
          headers: presigned.headers,
          onProgress: (fraction) => {
            setProgress((prev) => ({ ...prev, currentPhotoFraction: fraction }))
          },
        })

        if (uploadResult.status < 200 || uploadResult.status >= 300) {
          throw new IncidentPhotoUploadFailedError(i, uploadResult.status)
        }

        photoKeys.push(presigned.key)
        setProgress((prev) => ({ ...prev, uploadedCount: prev.uploadedCount + 1 }))
      }

      const payload: CreateIncidentPayload = {
        type: input.type,
        severity: input.severity,
        description: input.description,
        photoKeys,
        shiftId: input.shiftId,
        latitude: input.latitude,
        longitude: input.longitude,
      }
      return createIncident(payload)
    },
    onSuccess: () => {
      toast({ title: 'Сообщение отправлено', preset: 'done' })
      void qc.invalidateQueries({ queryKey: INCIDENTS_ROOT })
      setProgress(INITIAL_PROGRESS)
    },
    onError: (err: unknown) => {
      toast({
        title: 'Не удалось отправить',
        message: resolveErrorMessage(err),
        preset: 'error',
      })
      setProgress(INITIAL_PROGRESS)
    },
  })

  return {
    create: mutation.mutate,
    createAsync: mutation.mutateAsync,
    isCreating: mutation.isPending,
    progress,
    error: mutation.error,
    reset: () => {
      mutation.reset()
      setProgress(INITIAL_PROGRESS)
    },
  }
}

function resolveErrorMessage(err: unknown): string {
  if (err instanceof IncidentPhotoUploadFailedError) {
    return `Не удалось загрузить фото ${err.photoIndex + 1}. Проверьте соединение.`
  }
  if (err instanceof NetworkError) {
    return 'Нет соединения. Сообщение не отправлено.'
  }
  if (err instanceof ApiError) {
    if (err.code === 'NO_ORGANIZATION_CONTEXT') {
      return 'Сначала начните смену или дождитесь одобрения найма.'
    }
    if (err.code === 'PHOTO_CONTENT_TYPE_INVALID') {
      return 'Недопустимый формат фото.'
    }
    return err.message
  }
  return 'Попробуйте ещё раз'
}
