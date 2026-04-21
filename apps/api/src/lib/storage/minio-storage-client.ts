import type { Client as MinioClient } from 'minio'
import { StorageBackendError, StorageMultipartError } from './errors'
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
 * MinIO / S3-совместимый драйвер. Работает с любым endpoint-ом через
 * minio npm-пакет (в prod — MinIO self-hosted на Hetzner, в будущем
 * возможен AWS S3 / Hetzner Object Storage / Cloud.kz — интерфейс не меняется).
 *
 * Ограничение simple PUT maxBytes:
 *   presignedPutObject подписывает PUT без policy, S3/MinIO сигнатура не
 *   может enforce Content-Length по подписи. Серверная валидация делается
 *   на boundary в service-слое через headObject после успешного PUT
 *   (документ-модуль читает size и отклоняет / удаляет если > limit).
 *   Для STRICT enforcement есть presignedPostPolicy (POST upload), но это
 *   меняет клиентский flow. MVP обходится post-upload check'ом.
 *
 * TTL presigned URL'ов приходят из конфига и передаются sec-единицах в
 * minio-клиент — он сам подставляет X-Amz-Expires.
 */

export interface MinioStorageClientConfig {
  client: MinioClient
  bucket: string
  region: string
  presign: {
    getTtlSeconds: number
    putTtlSeconds: number
    partTtlSeconds: number
  }
}

// minio pakage типизирует statObject metaData как ItemBucketMetadata = {[k:string]:any}.
// Чтобы не тянуть `any` в публичные типы, сужаем локально.
type MinioMetadata = Record<string, unknown>

export class MinioStorageClient implements StorageClient {
  private readonly client: MinioClient
  private readonly bucket: string
  private readonly region: string
  private readonly getTtl: number
  private readonly putTtl: number
  private readonly partTtl: number

  constructor(cfg: MinioStorageClientConfig) {
    this.client = cfg.client
    this.bucket = cfg.bucket
    this.region = cfg.region
    this.getTtl = cfg.presign.getTtlSeconds
    this.putTtl = cfg.presign.putTtlSeconds
    this.partTtl = cfg.presign.partTtlSeconds
  }

  async ensureBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket)
      if (!exists) {
        await this.client.makeBucket(this.bucket, this.region)
      }
    } catch (err) {
      throw new StorageBackendError(`Failed to ensure bucket ${this.bucket}`, {
        cause: String(err),
      })
    }
  }

  async createPresignedPutUrl(key: string, opts: CreatePresignedPutOptions): Promise<PresignedPut> {
    try {
      const url = await this.client.presignedPutObject(this.bucket, key, this.putTtl)
      return {
        url,
        // Content-Type клиент обязан слать: minio/S3 применит к объекту при PUT.
        // Header обязательный, чтобы headObject затем вернул ожидаемый тип.
        headers: { 'Content-Type': opts.contentType },
        expiresAt: this.expiresIn(this.putTtl),
      }
    } catch (err) {
      throw new StorageBackendError('Failed to presign PUT', { cause: String(err) })
    }
  }

  async createPresignedGetUrl(
    key: string,
    opts: CreatePresignedGetOptions = {},
  ): Promise<PresignedGet> {
    try {
      const respParams: Record<string, string> = {}
      if (opts.responseContentDisposition) {
        respParams['response-content-disposition'] = opts.responseContentDisposition
      }
      const url = await this.client.presignedGetObject(
        this.bucket,
        key,
        this.getTtl,
        Object.keys(respParams).length > 0 ? respParams : undefined,
      )
      return { url, expiresAt: this.expiresIn(this.getTtl) }
    } catch (err) {
      throw new StorageBackendError('Failed to presign GET', { cause: String(err) })
    }
  }

  async createMultipartUpload(key: string, opts: CreateMultipartOptions): Promise<MultipartInit> {
    try {
      // minio требует headers-map с Content-Type; остальные метаданные
      // фиксируются на complete-шаге или позже через copyObject.
      const uploadId = await this.client.initiateNewMultipartUpload(this.bucket, key, {
        'Content-Type': opts.contentType,
      })
      return { uploadId, key }
    } catch (err) {
      throw new StorageBackendError('Failed to initiate multipart upload', {
        cause: String(err),
      })
    }
  }

  async createPresignedUploadPartUrl(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<PresignedPart> {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
      throw new StorageMultipartError(
        'STORAGE_INVALID_PART_NUMBER',
        'partNumber must be an integer in [1, 10000]',
        { partNumber },
      )
    }
    try {
      // presignedUrl поддерживает произвольные query-параметры через reqParams.
      // S3/MinIO принимают uploadId и partNumber как signed query params
      // для PUT части мультипарта.
      const url = await this.client.presignedUrl('PUT', this.bucket, key, this.partTtl, {
        uploadId,
        partNumber: String(partNumber),
      })
      return { url, expiresAt: this.expiresIn(this.partTtl) }
    } catch (err) {
      throw new StorageBackendError('Failed to presign multipart part URL', {
        cause: String(err),
        key,
        partNumber,
      })
    }
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<CompleteMultipartResult> {
    if (parts.length === 0) {
      throw new StorageMultipartError(
        'STORAGE_NO_PARTS',
        'Cannot complete multipart upload with zero parts',
      )
    }
    try {
      // minio-клиент требует отсортированный по part номеру массив
      // и свой формат {part, etag}.
      const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber)
      const result = await this.client.completeMultipartUpload(
        this.bucket,
        key,
        uploadId,
        sorted.map((p) => ({ part: p.partNumber, etag: p.etag })),
      )
      return { etag: result.etag }
    } catch (err) {
      throw new StorageBackendError('Failed to complete multipart upload', {
        cause: String(err),
        key,
        uploadId,
      })
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.client.abortMultipartUpload(this.bucket, key, uploadId)
    } catch (err) {
      // S3 возвращает NoSuchUpload для уже отменённого/несуществующего —
      // считаем идемпотентным, в соответствии с InMemory драйвером.
      const code = extractS3ErrorCode(err)
      if (code === 'NoSuchUpload') return
      throw new StorageBackendError('Failed to abort multipart upload', {
        cause: String(err),
        key,
        uploadId,
      })
    }
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    try {
      const stat = await this.client.statObject(this.bucket, key)
      const metaData = stat.metaData as MinioMetadata
      const contentType = pickContentType(metaData)
      return {
        size: stat.size,
        etag: stat.etag,
        contentType,
      }
    } catch (err) {
      const code = extractS3ErrorCode(err)
      if (code === 'NotFound' || code === 'NoSuchKey') return null
      throw new StorageBackendError('Failed to stat object', {
        cause: String(err),
        key,
      })
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, key)
    } catch (err) {
      // S3 removeObject идемпотентен по умолчанию (NoSuchKey не throw'ается
      // в minio-клиенте), но на всякий случай guard — некоторые S3-совместимые
      // backend'ы возвращают NoSuchKey явно.
      const code = extractS3ErrorCode(err)
      if (code === 'NoSuchKey' || code === 'NotFound') return
      throw new StorageBackendError('Failed to delete object', {
        cause: String(err),
        key,
      })
    }
  }

  private expiresIn(seconds: number): Date {
    return new Date(Date.now() + seconds * 1000)
  }
}

function pickContentType(metaData: Record<string, unknown>): string {
  // MinIO нормализует ключи в lowercase, но S3-совместимые backend'ы могут
  // отдавать и в каноническом виде. Проверяем оба варианта.
  const candidate = metaData['content-type'] ?? metaData['Content-Type'] ?? metaData.contentType
  if (typeof candidate === 'string' && candidate.length > 0) return candidate
  return 'application/octet-stream'
}

function extractS3ErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') {
    return err.code
  }
  return null
}
