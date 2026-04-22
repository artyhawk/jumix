# Architecture backlog

Решения, отложенные после MVP. Каждый пункт — что, зачем, когда включать.

---

## Auth

### Web cookie mode (pending arrival of `apps/web`)

Сейчас реализован mobile-first flow: `/auth/refresh` принимает `refreshToken` в JSON-body, `/auth/logout` — аналогично. Это подходит для мобилки (refresh лежит в `expo-secure-store`, передаётся явно).

Для веб-клиента нужна параллельная схема через HttpOnly-cookies (CLAUDE.md §5.2):

- **Access cookie:** `httpOnly`, `Secure`, `SameSite=Lax`, path `/api`, TTL = access TTL.
- **Refresh cookie:** `httpOnly`, `Secure`, `SameSite=Strict`, `path=/api/auth/refresh` (ограничивает отправку на refresh-endpoint).
- **CSRF:** double-submit pattern. На login сервер ставит non-HttpOnly cookie `csrf_token`, фронт копирует его в заголовок `X-CSRF-Token` на mutating запросах. Или `@fastify/csrf-protection` плагин — оценить когда появится `apps/web`.
- **Origin/Referer check:** дополнительный layer для mutating endpoints — сверять `request.headers.origin` с whitelist из `CORS_ORIGINS`.
- **Logout:** сервер шлёт `Set-Cookie` с `Max-Age=0`, клиенту ничего делать не нужно.
- **Rotation:** после успешной ротации — новые `Set-Cookie` с новой парой.

Переключение между cookie и bearer — по `clientKind` или отдельный suffix endpoint'а (`/auth/refresh/web` vs `/auth/refresh/mobile`). Решим при имплементации, зависит от того будет ли один fastify-app обслуживать оба клиента или веб пойдёт через Next.js server-actions proxy.

### `clientKind` authority

Сейчас `clientKind: 'web' | 'mobile'` приходит из тела запроса — клиент сам объявляет свой тип, а TTL refresh (30 vs 90 дней) зависит от этого. Это позволяет злонамеренному клиенту выписать себе долгоживущий mobile-токен с веб-сессии.

После запуска `apps/web` сделать серверным: `clientKind` выводится из User-Agent, Origin заголовков и наличия/отсутствия cookies (web всегда через cookies, mobile всегда через bearer). Передача в body — запрещена.

Не блокер для MVP: на стадии "только мобилка в проде" злоупотребить нечем, веб ещё не задеплоен.

### Enhanced rotation-race detection (post-MVP)

Сейчас race-detection использует 10-секундное окно + сравнение IP / User-Agent / deviceId с winner'ом. Балл 0 — чистый race (401 без revoke цепи), > 0 — эскалируется до full reuse. IP-изменение даёт 0.3 (решающее без GeoIP), UA — 1.0, deviceId — 2.0.

Улучшения когда появятся реальные данные:

- **GeoIP:** считать смену страны (через MaxMind/ipapi) решающим сигналом, IP в пределах одного ASN — не сигнал.
- **Mobile carrier ASN:** IP-флип в пределах одного оператора (переключение LTE-вышки) понижает риск, потенциально обнуляет вклад IP.
- **Device fingerprinting:** брать больше атрибутов от мобильного клиента (timezone, locale, screen size, OS version) — сравнивать как fingerprint, а не отдельные поля.
- **ML risk scoring:** если наберётся статистика реальных атак и false-positive'ов, заменить фиксированные веса.

Триггер для включения: первый реальный инцидент reuse-detection ИЛИ массовые жалобы на spurious logout после wake-from-background.

---

## Organizations

### Phone reuse across entity types (post-MVP)

Сейчас `users.phone` имеет глобальный UNIQUE, а `PHONE_ALREADY_REGISTERED` отдаётся при любой коллизии — вне зависимости от роли. Это корректно для MVP (один телефон = один user), но блокирует реальный кейс: человек сначала работает крановщиком в компании X, потом открывает свою компанию Y и хочет быть owner'ом. Сегодня такой сценарий требует ручной migration через суперадмина (смена роли + переназначение organization_id).

Пост-MVP options:
- **Multi-identity:** отделить `phones` от `users` — один phone → несколько user-ролей (operator в одном org, owner в другом). Требует переработки JWT claims и auth-flow (выбор роли при логине).
- **Explicit role upgrade:** API для superadmin'а "convert operator → owner", который reassigns organization_id без смены phone. Дешевле, но не покрывает одновременные роли.

Триггер: первый реальный запрос от заказчика или пользовательская жалоба. До этого — явный 409 в API документации достаточно.

### BIN external validation (post-MVP)

Сейчас валидируем BIN только по формальному checksum (KZ state algorithm, §2 shared/bin.ts). Это отклоняет случайные опечатки, но не проверяет существование юрлица в реестре — пользователь может ввести валидный-по-checksum, но несуществующий BIN.

Источники для проверки:
- **stat.gov.kz (БД юрлиц РК):** официальный государственный реестр. API существует, но требует регистрации и квоты — подходит для рабочего процесса, не для MVP где superadmin создаёт organizations вручную.
- **adata.kz:** коммерческий aggregator, возвращает name + status + адрес по BIN. Платный.
- **kgd.gov.kz (налоговая):** для проверки статуса налогоплательщика. Актуально если появится финансовый обмен.

Подключать когда: (а) self-service регистрация организаций (не через superadmin), либо (б) заказчик запросит auto-fill name/address по BIN в форме создания.

Не блокер MVP — superadmin проверяет BIN глазами по договору с клиентом.

---

## Cranes

### `cranes.tariffs_json` structured schema (blocked on payroll spec)

Сейчас `tariffs_json` хранится как свободный JSONB (`z.record(z.unknown())`). Это позволяет создавать краны и тестировать CRUD + ассоциации без финальной структуры тарифов.

Финальная структура придёт от специалиста заказчика на Этапе 3 (payroll engine). Ожидаемые поля (гипотеза, НЕ реализуется до подтверждения):

- `dayRate` / `nightRate` — часовые ставки
- `overtimeMultiplier` — коэффициент переработок
- `weekendMultiplier`, `holidayMultiplier`
- `fixedDailyRate` — альтернатива hourly
- `bonusStructure`
- `currency` (`'KZT'` в MVP)
- `effectiveFrom` / `effectiveTo` — история тарифов

Когда получим спеку → заменяем `z.record` на строгую Zod-схему + возможно JSONB CHECK constraint в БД. Сейчас owner/superadmin могут записать любой JSON в это поле. Payroll engine пока не использует `tariffs_json` (engine не написан — см. CLAUDE.md §4, Этап 3).

Триггер: получение спеки начислений от заказчика в первую неделю Этапа 3.

### Cover `siteId`-filter enumeration in cranes tests

Сейчас `GET /cranes?siteId=...` покрыт только happy-path (owner фильтрует по своему site). Foreign-siteId в query-параметре (owner A → `?siteId={orgB_siteId}`) НЕ имеет explicit теста.

Поведение скорее всего корректное: repository добавляет `WHERE organization_id = ctx.organizationId AND site_id = $filter` — пересечение пусто, вернётся `200 []` (не 403, legitimate query с бесполезным фильтром). Но без теста это полагание на имплементацию, регрессия пройдёт молча.

Отложено до Vertical B2 (operators): там появится аналогичный паттерн с `?craneId=...` query-фильтром. Добавить оба теста вместе — один для cranes.siteId, один для operators.craneId — чтобы закрыть класс "foreign resource ID in list filter" целиком.

Тест должен: создать org A (+ site + crane), org B (+ site), залогинить owner A, дёрнуть `GET /cranes?siteId={orgB_site.id}` → ожидать 200 с пустым items array.

### Cross-org crane transfer (holding-internal move)

Сейчас `cranes.organization_id` — fixed после create: `updateCraneSchema` не содержит поле, repository update-path не позволяет его менять. Кейс «холдинг перебрасывает кран между дочками» сегодня решается через soft-delete в org A + create в org B (новый crane.id, новый history, approval нужно проходить заново).

Пост-MVP — явный flow:
- `POST /api/v1/cranes/:id/transfer` с `{ targetOrganizationId }`, доступен только superadmin (валидирует, что target — дочка того же холдинга когда появится `holdings` таблица).
- Сохраняет crane.id; записывает audit `crane.transfer` с `{ fromOrgId, toOrgId }`; переклеивает `site_id` на NULL (site остаётся в исходной org); approval_status скорее всего остаётся `'approved'` (уже одобрен холдингом), но это решение зависит от compliance.
- История shifts / maintenance остаётся привязанной к старому org (для отчётов), новая активность пишется под target org.

Триггер: запрос от заказчика на cross-subsidiary перераспределение техники.

### Multi-stage approval (holding → compliance → tech)

Текущая ADR [0002](adr/0002-holding-approval-model.md) — single-stage: один `superadmin` approve/reject. Реальный процесс в холдинге может быть двух- или трёх-этапным: сначала compliance-officer проверяет документы, потом technical officer — характеристики крана, и только потом финальный approve от holding owner'а.

Пост-MVP — extension points:
- Добавить enum `approval_stage` (`compliance_pending`, `tech_pending`, `final_pending`, `approved`, `rejected`) взамен текущего plain `approval_status`.
- Новые роли superadmin-sub (`compliance_admin`, `tech_admin`) с правом менять свою stage.
- Каждый этап пишет свой audit + актор + timestamp. Rejection на любом этапе → терминальный rejected (как сейчас).

Альтернативы — workflow-движок (camunda-style) или checklist-модель (массив `approval_checks[]`). Решение зависит от того, захочет ли заказчик кастомизировать число этапов под свой процесс.

Триггер: запрос от заказчика на разделение approval-ответственности внутри холдинга.

### Notifications on approve/reject

Сейчас approve/reject меняет state + пишет audit, но не уведомляет owner'а. Реальный UX: owner добавил кран, ждёт решения — должен получить push/email/SMS «ваш кран одобрен» или «отклонён: причина X».

Пост-MVP:
- Notification worker job после транзакции approve/reject: `notifications` table + delivery через FCM / Mobizon.
- Templates: `{craneModel} на объекте {siteName} — одобрен холдингом` / `отклонён: {reason}`.
- Owner в вебе видит badge «требует внимания» на главной, mobile — push.

Триггер: первый production-кейс, где owner'ы жалуются на отсутствие фидбека по отправленным заявкам. До этого web UI в разделе «мои краны» с ?approvalStatus=rejected достаточно для discovery.

---

## Operators (from B2b)

### B2d-2a / B2d-2b — РЕШЕНО (см. ADR 0003 «Прогресс split'а»)

~~`X-Organization-Id` header + real approval workflow для hire~~

B2d-2a отгрузил plugin `organization-context` (header → `request.organizationContext` с approval/status-гейтом). B2d-2b переименовал `operator/` → `organization-operator/`, убрал compat-shim `createUserAndOperator` и развернул pipeline 2: POST hire принимает только `{craneProfileId, hiredAt?}` и создаёт **pending** hire; `POST /:id/approve` / `POST /:id/reject` (superadmin-only) завершают pайплайн. `canChangeStatus` требует `approval_status='approved'` (ENTITY_NOT_APPROVED / ENTITY_REJECTED_READONLY специализированы как `ORGANIZATION_OPERATOR_*`). Оба approval-pipeline'а (profile + hire) работают по § 4.2b. Вопрос закрыт.

### Operator transfer between organizations — РЕШЕНО B2d-1

~~Сейчас `operators.organization_id` — fixed после create...~~

ADR 0003 решил это через M:N `organization_operators`: один человек (`crane_profiles`) может одновременно работать в N дочках. «Transfer» теперь — hire в новой дочке + terminate в старой, без потери identity и audit-continuity. Вопрос закрыт.

### Crane_profile merge (duplicate resolution)

При переходе на `crane_profiles.iin GLOBAL UNIQUE` возможны legacy дубликаты: один и тот же человек заведён в двух дочках под немного разным написанием ФИО/с опечаткой в ИИН. В рамках B2d-1 данные пустые (dev/staging), collision'ов нет; на prod-миграции 0007 есть pre-check в SQL-комментарии.

Post-MVP: `POST /crane-profiles/:winner/merge` с `{ loserProfileId }`, доступен superadmin'у. Переносит все `organization_operators` с loser → winner, soft-delete'ит loser, audit с обеими id'шками. Нужно для cleanup'а после миграции и в случае OCR-ошибок при onboarding'е.

Триггер: первый реальный duplicate-report (скорее всего при onboarding'е крупного клиента).

### Rehire workflow (`rehired_at` column)

Сейчас `terminated_at` — historical record: при `terminated→active` дата увольнения сохраняется (см. commit 3 rationale). Это корректно для law-compliance (чтобы доказать что было увольнение), но теряется дата *возвращения* — если один и тот же оператор уволен в марте и возвращён в июне, мы не знаем дату возврата без парсинга `audit_log`.

Добавить `operators.rehired_at date null` и писать туда `sql`(now() at time zone 'utc')::date` при переходе `terminated→active`. Потребует миграции + расширение `changeStatus` в service. Нужно для отчётов «стаж в компании с учётом перерывов».

Триггер: финансовый отчёт с учётом «непрерывного стажа» (Этап 3) ИЛИ HR-запрос от заказчика.

### SMS re-verification on phone change

Сейчас `operators.phone` (точнее `users.phone`, связанный через FK) — immutable после create. Admin НЕ может менять phone через `PATCH /:id` (поле не в whitelist), operator НЕ может через `/me` (whitelist только ФИО). Это consciously restrictive — любая смена phone сейчас = soft-delete + create заново.

Post-MVP flow:
1. `POST /api/v1/operators/me/phone/change-request` — operator вводит новый phone.
2. SMS OTP на новый номер (через Mobizon).
3. `POST /api/v1/operators/me/phone/confirm` с кодом → `users.phone` атомарно обновляется, старые refresh-tokens revoke'аются (принудительный re-login на всех устройствах).
4. Audit с обоими номерами (старый + новый), уведомление admin'у org.

Триггер: реальный user-request (крановщик сменил SIM-карту). До этого acceptable workaround — admin делает soft-delete и создаёт заново.

### Orphan avatar cron

Сейчас presigned PUT создаёт объект в MinIO по `operators/<orgId>/<operatorId>/avatar/<uuid>.<ext>`, но confirm может не произойти (пользователь закрыл вкладку, сеть упала). Объект остаётся в bucket'е — никогда не пересечётся с DB, никогда не удалится.

Пост-MVP cron:
- Раз в сутки listObjects с префиксом `operators/*/avatar/`, для каждого key сверять с `operators.avatar_key` в БД.
- Если key НЕ матчится и `LastModified > 24h назад` — удалить (grace period на in-flight uploads).
- Альтернатива: MinIO lifecycle rule с tag `pending-confirm` который снимается в confirm handler.

Триггер: первые признаки bucket bloat ИЛИ жалоба на storage billing.

### Availability endpoints (shifts integration, Этап 2)

`operators.availability` (`free | busy | on_shift | null`) сейчас read-only — имеет CHECK что `NULL ⇔ status≠active`, но НЕТ endpoint'а для изменения. Это сознательно: availability меняется не admin-fiat, а как функция shifts state (когда shift started → `busy`/`on_shift`, когда ended → `free`).

На Этапе 2 shifts-модуль будет писать availability транзакционно вместе с shift events. Endpoint для ручного override (`PATCH /:id/availability`) — open question: скорее нужен (admin override когда data diverges) но с ограничениями (только superadmin? только для `free↔busy` не `on_shift`?). Решим когда появится shifts state machine.

### Bulk operations (CSV import)

Сейчас operators создаются по одному через `POST /operators`. Реальный onboarding org часто = 10-50 крановщиков сразу — manual form-filling неприемлем.

Post-MVP: `POST /api/v1/operators/bulk` с CSV upload → validation pre-flight (все phone уникальны, все IIN валидны, нет конфликтов) → атомарный insert всех либо ни одного. Report о результате — JSON с success/errors по строкам.

Триггер: onboarding крупного клиента с >10 операторов.

### `operators.specialization` structured schema

Сейчас `specialization` — свободный JSONB (`z.record(z.unknown())`). Ожидаемая структура (гипотеза, ожидает подтверждения):
- `craneTypes: CraneType[]` — какие типы кранов оператор умеет водить (match с `cranes.type_enum`).
- `licenseClasses: string[]` — классы удостоверения (по приказу Минтруда РК).
- `yearsOfExperience: number`
- `certifications: { name, issuedAt, expiresAt, issuer }[]`

Когда заказчик подтвердит структуру → заменить `z.record` на строгую схему + JSONB CHECK в БД. Связка с crane assignment (оператор может работать только на кране из своей specialization.craneTypes) — Этап 2.

### Preferred language (i18n per-user)

`users` не имеет `preferred_language` колонки. Сейчас язык определяется на клиенте (web persist в localStorage, mobile — в Expo SecureStore). Это ломается при: (а) первом логине на новом устройстве, (б) email/SMS от системы — сейчас шлём default RU.

Post-MVP: `users.preferred_language: 'ru' | 'kz'` (default 'ru'), `/me`-endpoint для self-update, применение в notification templates.

Триггер: появление SMS-notifications (Этап 2) ИЛИ email-шаблонов.

### Operator roles within organization

Сейчас внутри org все operators равны — нет concept'а «senior operator», «team lead», «trainee». Tariffs могут различаться (через `cranes.tariffs_json` или per-assignment), но role — нет.

Если заказчик захочет: добавить `operators.internal_role: string | null` (free-form tag, не enum — в каждой org свой набор). Не влияет на RBAC, только на UX (фильтры, отчёты, display).

Триггер: запрос от заказчика.

### Public operator profile QR code

Marketplace (Этап 4) — operators, согласившиеся быть видимыми на platform-wide бирже. Для физического обмена контактами на стройке (мастер участка фотографирует QR → видит profile crane-operator'а) нужен shareable link.

Post-MVP: `GET /public/operators/:token` где `token` — short-lived JWT или UUID из БД с TTL, генерируется operator'ом через `POST /me/public-link`. DTO — ограниченный (без phone, без IIN), только ФИО + avatar + specialization + rating.

Триггер: запрос от заказчика для marketplace UX.

---

## Storage (from B2a)

Решения зафиксированы в [storage.md](storage.md) §10. Краткий список:

1. **ClamAV virus scanning** на upload документов — worker job + `documents.scan_status`. Триггер: появление реальных документов крановщиков в системе.
2. **Public bucket для avatars / CDN** — если фронт-UX потребует моментальной отдачи без signed URL refresh.
3. **Lifecycle policy для auto-abort незавершённых multipart** — MinIO rule, когда bucket начнёт накапливать мусор.
4. **Retention policy для старых версий документов** — auto-delete `v1` при `vN > N` или `age > X дней`. Решение юриста по compliance.
5. **Signed URL caching в Redis** — для горячих GET.
6. **Image thumbnails** для аватаров (3 размера через worker).
7. **Server-side encryption (SSE-C / SSE-KMS)** — требует key management.
8. **Strict content-length enforcement** для simple PUT через `presignedPostPolicy` — актуально при появлении DoS-сценариев с большими uploads.
