# ADR-0005: License document upload + expiry cron

- **Дата:** 2026-04-22
- **Статус:** Accepted
- **Автор:** Yerbol
- **Scope:** B2d-4 — финальная вертикаль B2d-refactor'а. Закрывает ADR
  [0003](0003-operators-multi-org-model.md) добавляя документ-измерение к
  `crane_profile`: удостоверение крановщика, срок действия, версионированное
  хранение, cron предупреждений об истечении и третий gate в `canWork`.

## Контекст

ТЗ §5.1.5.1 требует, чтобы у каждого крановщика было загружено удостоверение
(PDF/фото), с датой окончания срока действия. Платформа обязана:
- не давать оператору работать без актуального удостоверения;
- заранее (за 30 и 7 дней) уведомлять, что срок истекает;
- сохранять историю документов (re-upload ≠ перезапись).

Идентичность крановщика уже живёт в `crane_profiles` (ADR 0003 pipeline 1),
аватар — там же (ADR 0003 §specialization/avatar). Логично, что и
удостоверение лежит в том же профиле: документ принадлежит человеку, а не
компании. Если оператор перейдёт в другую дочку — его удостоверение
остаётся с ним, не надо перезагружать.

Параллельно B2d-3 закрыл registration flow (ADR 0004). Новые крановщики
появляются через public SMS signup с `approval_status='pending'` и без
документов. Owner (holding) апрувит identity, после чего оператор
загружает license сам через мобилку. Admin path (superadmin) остаётся
запасным.

`canWork`, ранее «profile approved AND ≥1 approved+active hire» (B2d-3),
теперь **трёхфакторный**: третий gate — license valid (loaded & not
expired). Без валидного удостоверения оператор существует в системе,
получает JWT, видит свой профиль — но в смену выйти не может.

## Решение

### Поля на crane_profiles (migration 0009)

```
license_key                       text NULL   -- storage path (версионированный)
license_expires_at                date NULL   -- дата окончания (ТЗ: в днях, не секундах)
license_version                   int  NOT NULL DEFAULT 0
license_warning_30d_sent_at       timestamptz NULL
license_warning_7d_sent_at        timestamptz NULL
license_expired_at                timestamptz NULL
```

**Invariant (CHECK constraint):** `(license_key IS NULL AND license_expires_at IS NULL) OR (license_key IS NOT NULL AND license_expires_at IS NOT NULL)`. Частичные состояния невозможны — либо «не загружено», либо «загружено полностью».

**license_status НЕ хранится** как колонка. Computed на boundary
(`computeLicenseStatus(expiresAt, now)`):

| Условие | Status |
|---|---|
| `expiresAt IS NULL` | `missing` |
| `expiresAt <= now` | `expired` |
| `now < expiresAt <= now+7d` | `expiring_critical` |
| `now+7d < expiresAt <= now+30d` | `expiring_soon` |
| `expiresAt > now+30d` | `valid` |

Причина: статус меняется со временем без action'а. Хранить — значит запускать daily UPDATE всех rows только чтобы поддерживать корректность. Partial index `crane_profiles_license_expiry_scan_idx` (`license_expires_at WHERE license_expires_at IS NOT NULL AND deleted_at IS NULL`) покрывает hot path cron'а.

**warning_*_sent_at поля** — не user-facing, а маркеры для cron: «данный variant warning был отправлен, больше не шли». Re-upload сбрасывает их в NULL (новый срок → новый цикл предупреждений). `license_version` инкрементируется на каждый confirm.

### Версионированный storage path

```
crane-profiles/{craneProfileId}/license/v{N}/{filename}
```

`buildCraneProfileLicenseKey()` строит ключ из `licenseVersion + 1` при
каждом presign'е (следующая версия до confirm). Старые версии **остаются
в bucket** — ТЗ требует историю документов; compliance/дело о спорной
смене крановщика должны иметь доступ к тому удостоверению, которое было
валидным на момент смены. Retention (purge после N лет) — backlog.

Filename через `sanitizeFilename()` (URL-safe, без traversal). UUID
валидируется, version ≥ 1.

### HTTP endpoints (4)

| Endpoint | Actor | Profile state | Poses |
|---|---|---|---|
| `POST /api/v1/crane-profiles/me/license/upload-url` | operator (self) | `approved` только | 409 `CRANE_PROFILE_NOT_APPROVED` иначе |
| `POST /api/v1/crane-profiles/me/license/confirm` | operator (self) | `approved` только | same 409 |
| `POST /api/v1/crane-profiles/:id/license/upload-url` | superadmin | любой (override) | onboarding до approval |
| `POST /api/v1/crane-profiles/:id/license/confirm` | superadmin | любой | same |

**Flow (self-path, analog admin-path):**

1. Клиент `POST /me/license/upload-url` с `{contentType, filename}`.
   Сервер: content-type whitelist (jpeg/png/pdf), profile approved-check,
   `buildCraneProfileLicenseKey()` с `version = licenseVersion + 1`,
   `storage.createPresignedPutUrl(key, {maxBytes: 10MB})`. Ответ:
   `{uploadUrl, key, version, headers, expiresAt}`.

2. Клиент PUT-загружает файл напрямую в MinIO/S3 по presigned URL.

3. Клиент `POST /me/license/confirm` с `{key, expiresAt (YYYY-MM-DD)}`.
   Сервер:
   - **Prefix check:** `key` ДОЛЖЕН начинаться с
     `crane-profiles/{own-profile-id}/license/v{licenseVersion+1}/`.
     Иначе 400 `LICENSE_KEY_MISMATCH`. Защищает от foreign-profile
     injection (оператор A получил presign-url для своего профиля,
     но в confirm передаёт чужой ключ) и от stale version (дождался
     пока другой клиент confirm'нул свою версию, пытается переиспользовать).
   - **HEAD проверка:** `storage.headObject(key)`. Если object отсутствует
     (клиент получил presign, но PUT не сделал) — 400 `LICENSE_NOT_UPLOADED`.
   - **Content-type / size re-check** на `ContentType` и `ContentLength`
     из HEAD: если клиент обманул presign'д URL-а (в MinIO возможны
     нестандартные bypass'ы) — delete object, 400.
   - Транзакция: UPDATE `license_key`, `license_expires_at`,
     `license_version` (на nextVersion), сброс всех `license_warning_*`
     в NULL, INSERT audit `license.upload_self` (или `license.upload_admin`
     для admin path) с metadata `{key, version, expiresAt}`.

**licenseUrl в DTO:** на GET `/me` / `/:id` считается на лету через
`storage.createPresignedGetUrl(licenseKey, {expirySeconds: 15*60})`.
Не хранится. Null, если `licenseKey IS NULL`.

### Cron: LicenseExpiryWorker

Repeatable BullMQ job `license-expiry-scan` с pattern `'0 2 * * *'` tz
`Asia/Almaty` (ночью, после рабочего дня). Worker class —
`apps/api/src/jobs/license-expiry/worker.ts`, чистый сервис без BullMQ
coupling: принимает `(db, logger)`, отдаёт `process(now) →
{scanned, processed, warningsSent}`. Plugin `license-expiry/plugin.ts`
оборачивает его в queue + worker, но decorator `app.licenseExpiryWorker`
доступен всегда — тесты вызывают его напрямую, без Redis.

**Алгоритм:**

1. SELECT `id, licenseExpiresAt, warning_*_sent_at` WHERE
   `deleted_at IS NULL AND license_expires_at IS NOT NULL AND
   license_expires_at <= now + 30d AND (warning_30d_sent_at IS NULL
   OR warning_7d_sent_at IS NULL OR license_expired_at IS NULL)`.
2. Для каждой строки `determineWarning(row, now)` — чистая функция,
   возвращает `'30d' | '7d' | 'expired' | null` с приоритетом
   **expired > 7d > 30d**: если профиль одновременно попадает в
   несколько окон (cron пропустил 30d, проснулся когда уже 5 дней
   осталось), шлём только самый тяжёлый warning. Принцип «latest
   meaningful notification», не «серия предупреждений».
3. Транзакция: UPDATE нужного `warning_*_sent_at = now` с
   optimistic-check `WHERE ... IS NULL` (если concurrent worker уже
   проставил — RETURNING пустой, skip), INSERT audit
   `license.warning_sent` с metadata `{variant, expiresAt}`.

**Worker НЕ отправляет push/SMS.** В MVP достаточно audit-трейла + UI
бейджа (mobile считает `licenseStatus` на boundary и показывает
красный индикатор при `expiring_critical`/`expired`). Actual delivery —
в backlog notifications.

**Идемпотентность:** поля `warning_*_sent_at` — one-shot flags;
повторный run в тот же день не вставит второй audit (`WHERE ... IS NULL`
не матчится). Если оператор re-upload'ит — поля обнуляются, следующий
cycle cron сможет снова отправить.

### canWork — третий gate

```
canWork = profile.approvalStatus === 'approved'
       && memberships.some(m => m.approvalStatus === 'approved' && m.status === 'active')
       && isLicenseValidForWork(computeLicenseStatus(profile.licenseExpiresAt, now))
```

`isLicenseValidForWork` блокирует только `missing` и `expired`.
`expiring_*` — предупреждение, не блокировка: ТЗ §5.1.5.1 прямо просит
заранее напомнить, а не отключить.

### DTO surface

GET `/api/v1/crane-profiles/me` / `/:id` теперь возвращает:

```json
{
  "id": "...",
  "approvalStatus": "approved",
  "licenseExpiresAt": "2027-05-20",
  "licenseStatus": "valid",
  "licenseUrl": "https://...-presigned-get-url",
  "licenseVersion": 3,
  ...
}
```

GET `/me/status` (ADR 0004):

```json
{
  "profile": { ... },
  "licenseStatus": "expiring_critical",
  "memberships": [ ... ],
  "canWork": true
}
```

`licenseStatus` на top-level `/me/status` — удобство для mobile routing
(экран может переключаться сразу, без углубления в profile).

## Альтернативы

### 1. Отдельная таблица `crane_profile_documents` (N документов на профиль)

Плюсы: расширяемо (СИЗ, медосмотры etc.), история версий тривиально через
N rows. Минусы: MVP требует ОДИН документ — license. Таблицу пришлось бы
строить, индексировать, hydrate'ить JOIN'ом. ТЗ §5.1.5.1 не упоминает
других документов у крановщика кроме license; медосмотры и допуски — в
бизнес-логике organization_operators (не у identity-профиля). YAGNI.

### 2. Хранить `license_status` как колонку с daily UPDATE

Плюсы: query `WHERE license_status = 'expired'` без boundary-computation.
Минусы: daily cron должен UPDATE'ить буквально каждый row в таблице
только ради поддержания статуса. Partial index по `license_expires_at`
даёт тот же lookup performance без state drift.

### 3. Cron с 3 отдельными jobs (30d scan, 7d scan, expired scan)

Плюсы: разделение приоритетов, легче monitor'ить по variant'ам. Минусы:
три repeatable-схемы в BullMQ, три worker'а, потенциальный spam если
оператор одновременно попадает в 7d и expired (два push подряд).
Consolidation в один job с `determineWarning()`-priority проще и
атомарно.

### 4. Принудительная загрузка license на registration

Плюсы: новых профилей без license не бывает, canWork сразу понятен.
Минусы: ломает ADR 0004 flow (signup через SMS — быстрый, 2 шага);
заставлять грузить документ на 3м шаге — user-hostile. Owner может
захотеть зарегистрировать оператора без документа (сотрудник только
вышел на работу, бумажная копия ещё не переведена в цифру). Документ —
отдельное действие, blocking только работы (canWork), не идентичности.

## Последствия

**Положительные:**
- License-gate корректно блокирует работу без активного документа.
- Cron даёт заказчику predictable 30/7/0 день предупреждения.
- Версионированный storage path — история изменений документа навсегда.
- Computed license_status — нет state-drift между БД и реальным временем.
- Re-upload обнуляет warnings — цикл предупреждений работает для
  продлений без ручного reset'а.

**Отрицательные:**
- Orphaned objects: если клиент получил presign но не confirm'нул —
  файл остаётся в bucket без ссылки. Lifecycle rule на MinIO
  («удалять объекты в `crane-profiles/*/license/v*/` старше N дней без
  reference-update») — backlog.
- Cron не шлёт реальные push/SMS в MVP. UI показывает status, но push-
  integration'а нет до notifications-слоя.
- Admin может confirm license для pending profile — если потом profile
  rejected, license остаётся. Cleanup — через admin UI вручную, в MVP
  не автоматизируется.
- Прошлые версии license накапливаются в bucket без автоматического
  purge — затраты на хранение растут линейно с количеством re-upload'ов.
  Retention policy — backlog.

### Не решено (backlog)

- **Notification-слой:** actual push/SMS доставка 30d/7d/expired
  warnings. Сейчас audit-only.
- **Retention policy** для старых версий license (N лет compliance →
  purge).
- **Orphan cleanup cron** для presigned-но-не-confirmed объектов.
- **License upload rate-limit** (сейчас только через общий API rate-limit).
  Потенциально оператор может spam'ить confirm/re-upload — не критично
  для MVP но можно ограничить «1 новая версия в сутки».
- **Multi-document extension:** медосмотр, СИЗ-журнал, допуски. Когда
  потребуется третий document — rule of three сработает, выносим в
  отдельную таблицу `crane_profile_documents`.

## Референсные модули

- `apps/api/src/modules/crane-profile/license-status.ts` — computed status.
- `apps/api/src/modules/crane-profile/crane-profile.service.ts` —
  `requestLicenseUpload*` / `confirmLicense*` методы.
- `apps/api/src/jobs/license-expiry/` — worker class + BullMQ plugin.
- `apps/api/src/lib/storage/object-key.ts` §`buildCraneProfileLicenseKey`.
- `packages/db/migrations/0009_crane_profiles_license.sql`.
- `CLAUDE.md §6 rule #15` — критичные инварианты (license-gate,
  versioned storage, admin override).
