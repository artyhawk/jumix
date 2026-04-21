import { AppError } from '../errors'

/**
 * Storage-specific ошибки. Отдельные классы от generic AppError, чтобы:
 *  1. Callers могли ловить конкретный тип (instanceof) без парсинга code
 *  2. Коды были централизованы — не разбредались по InMemory/Minio реализациям
 *  3. HTTP-статусы были однозначны (backend-side faults → 500, client/logic → 4xx)
 *
 * См. feedback_api_style — detailed codes, не схлопывать в общий CONFLICT/INTERNAL.
 */

/** Невалидный ключ объекта (выходит за пределы orgs/{id}/..., traversal, пустой). */
export class StorageKeyError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ statusCode: 400, code: 'STORAGE_INVALID_KEY', message, details })
    this.name = 'StorageKeyError'
  }
}

/** Неверный uploadId или число партов в completeMultipartUpload. */
export class StorageMultipartError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super({ statusCode: 400, code, message, details })
    this.name = 'StorageMultipartError'
  }
}

/**
 * Backend-side сбой (MinIO недоступен, bucket не создан, credentials).
 * Мапится в 500 INTERNAL — не раскрывает детали клиенту, но логируется.
 */
export class StorageBackendError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ statusCode: 500, code: 'STORAGE_BACKEND_ERROR', message, details })
    this.name = 'StorageBackendError'
  }
}
