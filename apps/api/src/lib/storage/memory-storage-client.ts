import { createHash, randomUUID } from 'node:crypto'
import { StorageKeyError, StorageMultipartError } from './errors'
import type {
  CompleteMultipartResult,
  CompletedPart,
  CreateMultipartOptions,
  CreatePresignedGetOptions,
  CreatePresignedPutOptions,
  MultipartInit,
  ObjectMetadata,
  PresignedGet,
  PresignedPart,
  PresignedPut,
  StorageClient,
} from './types'

/**
 * In-memory driver для тестов. Никаких сетевых вызовов, никаких контейнеров.
 *
 * Что симулируем:
 *  - putObjectRaw / completeMultipartUpload сохраняют буфер в Map
 *  - headObject возвращает metadata или null
 *  - deleteObject — идемпотентно
 *  - multipart: uploadId = uuid, parts сохраняются в отдельной Map,
 *    completeMultipartUpload склеивает по partNumber и переносит в main storage
 *  - presigned URL-ы: fake `memory://{key}?...` токены. Консюмеры в тестах
 *    НЕ ходят по URL — они вызывают putObjectRaw / getObjectRaw напрямую.
 *    Это сознательный trade-off: real-URL-flow проверяем в smoke-тесте на
 *    настоящем MinIO через Testcontainers.
 *
 * Tests-utility методы (putObjectRaw, getObjectRaw, reset, listKeys) НЕ входят
 * в StorageClient interface — доступны только если caller держит ссылку на
 * конкретный InMemoryStorageClient (buildApp возвращает StorageClient,
 * но тесты могут инстанциировать клиент напрямую).
 */

interface StoredObject {
  body: Buffer
  contentType: string
  etag: string
}

interface PendingMultipart {
  key: string
  contentType: string
  parts: Map<number, { body: Buffer; etag: string }>
}

export class InMemoryStorageClient implements StorageClient {
  private readonly objects = new Map<string, StoredObject>()
  private readonly multipart = new Map<string, PendingMultipart>()

  /** Фиксированная clock-функция для детерминированных expiresAt в тестах. */
  constructor(private readonly now: () => Date = () => new Date()) {}

  async ensureBucket(): Promise<void> {
    // no-op: bucket концептуально всегда существует. Метод в интерфейсе
    // нужен чтобы plugin-flow (ensureBucket в dev/test) не ветвился по драйверу.
  }

  async createPresignedPutUrl(key: string, opts: CreatePresignedPutOptions): Promise<PresignedPut> {
    this.assertKey(key)
    const expiresAt = this.expiresIn(300)
    const token = randomUUID()
    const url = this.fakeUrl('put', key, {
      token,
      contentType: opts.contentType,
      maxBytes: opts.maxBytes?.toString() ?? '',
    })
    return {
      url,
      headers: { 'Content-Type': opts.contentType },
      expiresAt,
    }
  }

  async createPresignedGetUrl(
    key: string,
    opts: CreatePresignedGetOptions = {},
  ): Promise<PresignedGet> {
    this.assertKey(key)
    const expiresAt = this.expiresIn(900)
    const url = this.fakeUrl('get', key, {
      token: randomUUID(),
      disposition: opts.responseContentDisposition ?? '',
    })
    return { url, expiresAt }
  }

  async createMultipartUpload(key: string, opts: CreateMultipartOptions): Promise<MultipartInit> {
    this.assertKey(key)
    const uploadId = randomUUID()
    this.multipart.set(uploadId, {
      key,
      contentType: opts.contentType,
      parts: new Map(),
    })
    return { uploadId, key }
  }

  async createPresignedUploadPartUrl(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<PresignedPart> {
    this.assertKey(key)
    const pending = this.multipart.get(uploadId)
    if (!pending || pending.key !== key) {
      throw new StorageMultipartError(
        'STORAGE_UPLOAD_NOT_FOUND',
        'Multipart upload not found for given key/uploadId',
        { key, uploadId },
      )
    }
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
      throw new StorageMultipartError(
        'STORAGE_INVALID_PART_NUMBER',
        'partNumber must be an integer in [1, 10000]',
        { partNumber },
      )
    }
    return {
      url: this.fakeUrl('part', key, { uploadId, partNumber: partNumber.toString() }),
      expiresAt: this.expiresIn(900),
    }
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<CompleteMultipartResult> {
    this.assertKey(key)
    const pending = this.multipart.get(uploadId)
    if (!pending || pending.key !== key) {
      throw new StorageMultipartError(
        'STORAGE_UPLOAD_NOT_FOUND',
        'Multipart upload not found for given key/uploadId',
        { key, uploadId },
      )
    }
    if (parts.length === 0) {
      throw new StorageMultipartError(
        'STORAGE_NO_PARTS',
        'Cannot complete multipart upload with zero parts',
      )
    }

    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber)
    const buffers: Buffer[] = []
    for (const part of sorted) {
      const stored = pending.parts.get(part.partNumber)
      if (!stored) {
        throw new StorageMultipartError(
          'STORAGE_PART_MISSING',
          `Part ${part.partNumber} was not uploaded`,
          { partNumber: part.partNumber },
        )
      }
      if (stored.etag !== part.etag) {
        throw new StorageMultipartError(
          'STORAGE_PART_ETAG_MISMATCH',
          `Part ${part.partNumber} etag mismatch`,
          { partNumber: part.partNumber, expected: stored.etag, got: part.etag },
        )
      }
      buffers.push(stored.body)
    }

    const body = Buffer.concat(buffers)
    const etag = this.computeEtag(body)
    this.objects.set(key, {
      body,
      contentType: pending.contentType,
      etag,
    })
    this.multipart.delete(uploadId)
    return { etag }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const pending = this.multipart.get(uploadId)
    if (pending && pending.key === key) {
      this.multipart.delete(uploadId)
    }
    // идемпотентно: abort несуществующего upload'а — не ошибка
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    this.assertKey(key)
    const obj = this.objects.get(key)
    if (!obj) return null
    return {
      size: obj.body.length,
      contentType: obj.contentType,
      etag: obj.etag,
    }
  }

  async deleteObject(key: string): Promise<void> {
    this.assertKey(key)
    this.objects.delete(key)
  }

  // ---------- Test-only utilities (не в интерфейсе) ----------

  /** Загрузить объект синхронно, имитируя успешный presigned PUT. */
  putObjectRaw(key: string, body: Buffer, contentType: string): void {
    this.assertKey(key)
    this.objects.set(key, {
      body,
      contentType,
      etag: this.computeEtag(body),
    })
  }

  /** Прочитать объект синхронно, имитируя GET. null если не существует. */
  getObjectRaw(key: string): { body: Buffer; contentType: string; etag: string } | null {
    const obj = this.objects.get(key)
    return obj ? { ...obj, body: Buffer.from(obj.body) } : null
  }

  /** Залить один парт мультипарта (эквивалент успешного PUT на part URL). */
  uploadPartRaw(uploadId: string, partNumber: number, body: Buffer): { etag: string } {
    const pending = this.multipart.get(uploadId)
    if (!pending) {
      throw new StorageMultipartError('STORAGE_UPLOAD_NOT_FOUND', 'Multipart upload not found', {
        uploadId,
      })
    }
    const etag = this.computeEtag(body)
    pending.parts.set(partNumber, { body: Buffer.from(body), etag })
    return { etag }
  }

  /** Сброс состояния между тестами. */
  reset(): void {
    this.objects.clear()
    this.multipart.clear()
  }

  listKeys(): string[] {
    return [...this.objects.keys()]
  }

  hasPendingUpload(uploadId: string): boolean {
    return this.multipart.has(uploadId)
  }

  // ---------- internals ----------

  private assertKey(key: string): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new StorageKeyError('key must be a non-empty string')
    }
    if (key.includes('..') || key.startsWith('/')) {
      throw new StorageKeyError('key contains illegal path segments', { key })
    }
  }

  private computeEtag(body: Buffer): string {
    return createHash('md5').update(body).digest('hex')
  }

  private expiresIn(seconds: number): Date {
    return new Date(this.now().getTime() + seconds * 1000)
  }

  private fakeUrl(op: string, key: string, params: Record<string, string>): string {
    const query = new URLSearchParams(params).toString()
    return `memory://${op}/${encodeURIComponent(key)}?${query}`
  }
}
