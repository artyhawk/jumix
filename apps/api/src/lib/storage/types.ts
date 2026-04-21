/**
 * StorageClient — абстракция над S3-совместимым object storage.
 *
 * Реализации (см. CLAUDE.md index → storage):
 *   - MinioStorageClient: production + dev через minio npm-пакет
 *   - InMemoryStorageClient: unit/integration тесты без контейнеров
 *
 * Плагин apps/api/src/plugins/storage.ts выбирает драйвер по env
 * (STORAGE_ENDPOINT задан → Minio, иначе → InMemory).
 *
 * Модули (documents, avatars) работают ТОЛЬКО через интерфейс, никогда
 * не импортируют конкретный клиент. Это гарантирует, что в тестах
 * можно подставить InMemory через app.storage без моков minio-пакета.
 *
 * Конвенция ключей + TTL + retention — docs/architecture/storage.md.
 */

export interface PresignedPut {
  url: string
  /** Заголовки, которые клиент обязан включить в PUT. Например Content-Type. */
  headers: Record<string, string>
  expiresAt: Date
}

export interface PresignedGet {
  url: string
  expiresAt: Date
}

export interface PresignedPart {
  url: string
  expiresAt: Date
}

export interface MultipartInit {
  uploadId: string
  key: string
}

export interface CompletedPart {
  partNumber: number
  etag: string
}

export interface CompleteMultipartResult {
  etag: string
}

export interface ObjectMetadata {
  size: number
  contentType: string
  etag: string
}

export interface CreatePresignedPutOptions {
  contentType: string
  /**
   * Лимит размера (байты). Важно проставлять на HTTP boundary:
   * подписанный URL без лимита == клиент может загрузить любой объём.
   * В MinIO реализации это `policy.setContentLengthRange`.
   */
  maxBytes?: number
}

export interface CreatePresignedGetOptions {
  /** Content-Disposition в ответе — для download с предложенным filename. */
  responseContentDisposition?: string
}

export interface CreateMultipartOptions {
  contentType: string
}

export interface StorageClient {
  /**
   * Простая загрузка (маленькие файлы, ≤5MB). Клиент делает один PUT.
   * Используется для avatars и мелких вложений.
   */
  createPresignedPutUrl(key: string, opts: CreatePresignedPutOptions): Promise<PresignedPut>

  /**
   * Multipart-загрузка (5-10MB+, mobile с плохим интернетом).
   * Flow: createMultipartUpload → createPresignedUploadPartUrl × N → completeMultipartUpload.
   * При отмене / expiry — abortMultipartUpload, иначе неполные части лежат бесплатно в бакете.
   *
   * NOTE: retention неполных uploads в backlog (lifecycle policy).
   */
  createMultipartUpload(key: string, opts: CreateMultipartOptions): Promise<MultipartInit>
  createPresignedUploadPartUrl(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<PresignedPart>
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<CompleteMultipartResult>
  abortMultipartUpload(key: string, uploadId: string): Promise<void>

  /** Подписанный GET для просмотра/скачивания через browser/mobile. */
  createPresignedGetUrl(key: string, opts?: CreatePresignedGetOptions): Promise<PresignedGet>

  /** null если объект не существует (без throw). */
  headObject(key: string): Promise<ObjectMetadata | null>

  /** Идемпотентно — delete несуществующего объекта не падает. */
  deleteObject(key: string): Promise<void>

  /**
   * Создать бакет, если его ещё нет. Вызывается плагином на старте в
   * dev/test; в prod (STORAGE_ENSURE_BUCKET=false) не трогаем.
   */
  ensureBucket(): Promise<void>
}
