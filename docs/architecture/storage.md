# Object Storage — MinIO / S3

> Layout, key-конвенции, versioning, TTL, backlog. Контракт живёт в
> `apps/api/src/lib/storage/types.ts` (interface `StorageClient`).

---

## 1. Bucket layout

**Single bucket, tenant-isolation через key-prefix.**

- Имя бакета по умолчанию: `jumix-documents` (`STORAGE_BUCKET`).
- Все объекты под префиксом `orgs/{orgId}/...`.
- Per-tenant buckets **не делаем** — MinIO имеет мягкий лимит по количеству
  бакетов, backup/lifecycle/mirror проще управляются одним бакетом,
  tenant-boundary проверяется на уровне API (policy + service validate orgId
  в path перед подписанием URL).

---

## 2. Конвенция ключей

Строятся через хелперы в `apps/api/src/lib/storage/object-key.ts`:

```
orgs/{orgId}/operators/{operatorId}/avatar/{filename}
orgs/{orgId}/operators/{operatorId}/documents/{documentId}/v{version}/{filename}
```

**Правила:**
- `orgId`, `operatorId`, `documentId` — UUID v4. Валидируются на input.
- `version` — положительное целое, растёт монотонно: новая версия документа =
  новый объект, **старые не перетираются** (аудит + возможность revert).
- `filename` санитизируется: только `[a-zA-Z0-9._-]`, иначе scrub → `_`,
  collapse, trim. Оригинальное имя храним в БД (таблица `documents.original_name`),
  ключ — деривативно от `documentId/version`.
- Tenant-check на boundary: service-слой `assert ctx.orgId ===
  extractOrgIdFromKey(key)` перед подписанием URL'а. Утечка cross-tenant
  prefix'а через manual input = security инцидент.

---

## 3. Versioning

В явной форме в ключе (`v1`, `v2`, `...`) — не используем S3 bucket versioning.

**Причины:**
1. S3 bucket versioning требует дополнительной логики на clean-up (delete markers) и усложняет backup.
2. Явный `vN` в key даёт human-readable аудит-трейл (`orgs/…/documents/…/v3/passport.pdf` сразу видно в admin-UI).
3. Retention старых версий: пока **держим все**, cleanup — в backlog (lifecycle policy + UI для revert/delete).

---

## 4. Presigned URL TTL

Источник: `STORAGE_PRESIGN_*_TTL_SECONDS` в env. Умолчания:

| Operation | TTL   | Reason |
|-----------|-------|--------|
| PUT       | 300s  | Upload-сессия короткая, сигнатуры не утекают надолго |
| GET       | 900s  | Просмотр в веб-UI, комфортный reuse без частых refresh'ей |
| PART (MP) | 900s  | Mobile upload большого файла по плохому интернету, retry части |

Все значения — **секунды**.

---

## 5. Multipart upload

**Используется day 1**, не отложено. ТЗ: документы до 10 MB, основной консюмер
— мобилка на стройке с слабым интернетом. Retry отдельной части без
перезагрузки всего файла обязателен.

Flow (B2c):
1. `createMultipartUpload(key, { contentType })` → `uploadId`
2. `createPresignedUploadPartUrl(key, uploadId, partNumber)` × N (клиент шлёт PUT на каждую часть)
3. `completeMultipartUpload(key, uploadId, parts[])` → финальный etag
4. При отмене: `abortMultipartUpload(key, uploadId)` — иначе недозагруженные
   части лежат в бакете и жгут место. Lifecycle policy для auto-abort → backlog.

S3 требует **≥5 MiB на part** (кроме last). API B2c нарезает на клиенте.

---

## 6. Файловые лимиты и инфра

- **Max file size:** 10 MB (enforced в B2c на boundary — `maxBytes` в
  presigned PUT options, плюс server-side `headObject` check после upload'а
  с auto-delete если превышен).
- **MinIO volume:** на старте 200 GB на Hetzner Cloud Volume. Масштабируется
  volume resize (без downtime для приложения).
- **Простой PUT (avatars):** `presignedPutObject` — S3-подпись **не**
  enforce'ит `Content-Length`. Валидация через `headObject` после upload'а.
  Для строгого enforcement есть `presignedPostPolicy` (POST, с
  `setContentLengthRange`) — **в backlog**, пока не нужно.

---

## 7. Avatars

**Храним в том же private bucket** с presigned GET (TTL 15 мин).

Rationale:
- Проще инфра: один bucket, одна модель доступа (все URL подписываются).
- Нет риска случайной публичной индексации.

Trade-off: фронтенд обновляет URL аватарки периодически (browser-кэш 15 мин
по TTL). Если UX потребует — переход на:
- Отдельный **public bucket** для аватарок + CDN, или
- **Signed URL caching** в Redis с хитрой инвалидацией.

→ Backlog, не MVP.

---

## 8. Drivers

| Driver | Где используется | Файл |
|---|---|---|
| `MinioStorageClient` | dev (compose), prod | `apps/api/src/lib/storage/minio-storage-client.ts` |
| `InMemoryStorageClient` | unit + integration тесты (включая buildApp) | `apps/api/src/lib/storage/memory-storage-client.ts` |

Выбор в `apps/api/src/plugins/storage.ts`:
- `STORAGE_ENDPOINT` задан → Minio (dynamic import `minio` пакета — не
  попадает в test-граф, как `ioredis` в redis плагине)
- не задан → InMemory

Smoke-тест на настоящем MinIO (Testcontainers) — `apps/api/tests/storage.smoke.test.ts`.

---

## 9. Env

| Var | Default | Обязательность |
|---|---|---|
| `STORAGE_ENDPOINT` | — | prod обязателен (refine в server.ts по NODE_ENV) |
| `STORAGE_ACCESS_KEY` | — | пара с endpoint |
| `STORAGE_SECRET_KEY` | — | пара с endpoint |
| `STORAGE_REGION` | `us-east-1` | MinIO игнорит, SDK требует |
| `STORAGE_BUCKET` | `jumix-documents` | |
| `STORAGE_FORCE_PATH_STYLE` | `true` | MinIO не поддерживает vhost-style |
| `STORAGE_PRESIGN_GET_TTL_SECONDS` | `900` | |
| `STORAGE_PRESIGN_PUT_TTL_SECONDS` | `300` | |
| `STORAGE_PRESIGN_PART_TTL_SECONDS` | `900` | |
| `STORAGE_ENSURE_BUCKET` | dev/test: `true`, prod: `false` | Плагин автосоздаёт bucket если `true` |

---

## 10. Backlog (отложено из B2a)

1. **ClamAV virus scanning** на upload (особенно для документов крановщиков —
   чужие сканы/фото). Реализация: после complete в B2c — worker job ставит
   файл в scan queue; `documents.scan_status` = `pending/clean/infected`.
2. **Public bucket для avatars / CDN** — если UX потребует моментальной
   отдачи без signed URL.
3. **Lifecycle policy для аборта незавершённых multipart** — MinIO
   поддерживает rule «abort after N days». Сейчас полагаемся на explicit
   `abortMultipartUpload` из B2c; если забьёт bucket — добавим rule.
4. **Retention policy для старых версий документов** — auto-delete `v1` когда
   `vN` > threshold дней/версий. Тригерится решением юриста по compliance.
5. **Signed URL caching в Redis** — если один и тот же GET URL запрашивается
   много раз за короткий период, кешируем подписанный URL до истечения.
6. **Image thumbnails** для аватаров (worker job + 3 размера).
7. **Server-side encryption (SSE-C / SSE-KMS)** — MinIO поддерживает, но требует
   key management. Post-MVP.
8. **Strict content-length enforcement для simple PUT** через
   `presignedPostPolicy` — когда появятся случаи DoS через большие uploads.

---

## 11. Security highlights

- **Tenant-isolation** — на входе policy проверяет `ctx.orgId`, на выходе
  `extractOrgIdFromKey(key) === ctx.orgId` в service (паттерн B2c).
  Утечка = security инцидент.
- **Path-traversal** — `InMemoryStorageClient` и `object-key.ts` отклоняют
  `..` и leading `/`. MinIO сам отклоняет невалидные S3-ключи.
- **SSRF через presigned URL** — клиенты не получают endpoint напрямую,
  только подписанный URL с expiry. Infra-side: MinIO не должен быть доступен
  из internet напрямую — только через nginx с правилом `/storage/` (или
  отдельный поддомен `cdn.jumix.kz` с rate-limit'ом).
- **Audit** — все upload/delete/complete операции пишутся в `audit_log`
  (делается в B2c на service-слое).
