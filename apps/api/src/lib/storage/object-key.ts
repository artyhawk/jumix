import { StorageKeyError } from './errors'

/**
 * Канонические object keys для Jumix storage.
 *
 *   orgs/{orgId}/operators/{operatorId}/documents/{documentId}/v{version}/{filename}
 *   crane-profiles/{craneProfileId}/avatar/{filename}   ← platform-level identity (ADR 0003)
 *
 * Конвенция (docs/architecture/storage.md):
 *  - Single bucket; org-scoped артефакты — под `orgs/{orgId}/...`,
 *    платформенные (crane_profiles identity — ADR 0003) — под
 *    `crane-profiles/{craneProfileId}/...`. Последние описывают человека,
 *    а не факт работы в конкретной дочке, поэтому tenant-prefix был бы
 *    искусственной привязкой к «первой» org.
 *  - Versioning явно в ключе: новая версия = новый объект, старая остаётся
 *    для аудита и revert. Retention отложена в backlog.
 *  - UUID'ы для orgId/operatorId/craneProfileId/documentId — безопасны в path.
 *  - Filename из user-input — санитизируется (только [a-z0-9._-], иначе
 *    fallback на `file`).
 *
 * Helper'ы чисто формирование ключей, НЕ проверяют существование, НЕ
 * обращаются к БД — только детерминированное имя. Tenant-check делается
 * выше по стеку (service + policy) перед передачей key в storage.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FILENAME_SAFE_RE = /^[a-zA-Z0-9._-]+$/

function assertUuid(value: string, field: string): void {
  if (!UUID_RE.test(value)) {
    throw new StorageKeyError(`${field} must be a UUID`, { field, value })
  }
}

/**
 * Оставляем только [a-zA-Z0-9._-], обрезаем до 120 символов. Пустой/невалидный
 * → 'file' (не throw: storage-ключ всегда должен строиться, фронт показывает
 * оригинальное имя из metadata, не из ключа).
 */
export function sanitizeFilename(raw: string): string {
  const trimmed = raw.trim().slice(0, 120)
  if (trimmed.length === 0) return 'file'
  if (!FILENAME_SAFE_RE.test(trimmed)) {
    const scrubbed = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_')
    return scrubbed.replace(/_+/g, '_').replace(/^[._-]+|[._-]+$/g, '') || 'file'
  }
  return trimmed
}

/**
 * Legacy org-scoped avatar helper (operator module B2a-B2d-1 flow). Оставлен
 * для документов и переходного периода; новые avatar uploads используют
 * `buildCraneProfileAvatarKey` (identity — platform-level).
 */
export function buildAvatarKey(params: {
  organizationId: string
  operatorId: string
  filename: string
}): string {
  assertUuid(params.organizationId, 'organizationId')
  assertUuid(params.operatorId, 'operatorId')
  return `orgs/${params.organizationId}/operators/${params.operatorId}/avatar/${sanitizeFilename(params.filename)}`
}

/**
 * Platform-level identity prefix (ADR 0003). Avatar принадлежит
 * crane_profile, а не organization_operator — человек в N дочках
 * показывает одну и ту же фотку, нет «org А видит другой аватар».
 */
export function buildCraneProfileAvatarKey(params: {
  craneProfileId: string
  filename: string
}): string {
  assertUuid(params.craneProfileId, 'craneProfileId')
  return `crane-profiles/${params.craneProfileId}/avatar/${sanitizeFilename(params.filename)}`
}

export function buildDocumentKey(params: {
  organizationId: string
  operatorId: string
  documentId: string
  version: number
  filename: string
}): string {
  assertUuid(params.organizationId, 'organizationId')
  assertUuid(params.operatorId, 'operatorId')
  assertUuid(params.documentId, 'documentId')
  if (!Number.isInteger(params.version) || params.version < 1) {
    throw new StorageKeyError('version must be a positive integer', {
      version: params.version,
    })
  }
  return [
    'orgs',
    params.organizationId,
    'operators',
    params.operatorId,
    'documents',
    params.documentId,
    `v${params.version}`,
    sanitizeFilename(params.filename),
  ].join('/')
}

/**
 * Вытащить organizationId из ключа для sanity-check на boundary
 * (service-слой проверяет что ctx.orgId совпадает с owner-prefix ключа).
 * Возвращает null если формат не совпадает с конвенцией.
 */
export function extractOrgIdFromKey(key: string): string | null {
  const match = /^orgs\/([0-9a-f-]{36})\//i.exec(key)
  return match ? (match[1] ?? null) : null
}
