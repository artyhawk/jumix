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

### B2d-3 — РЕШЕНО (public SMS-registration + /me/status)

~~Публичный self-serve flow регистрации крановщиков через мобилку~~

B2d-3 отгрузил ADR [0004](adr/0004-public-registration-flow.md): `POST /api/v1/registration/start` + `/verify` как тонкий orchestration-слой поверх `SmsAuthService` + `TokenIssuerService` (переиспользуем OTP store, 1/60s + 5/hour phone + 20/hour IP rate-limit, `auth_events.sms_*` audit). Verify транзакционно создаёт `users{role:'operator', organizationId:null}` + `crane_profiles{approvalStatus:'pending'}` + `audit_log.registration.complete`, потом выдаёт JWT-пару. Migration 0008 ослабила `users_org_role_consistency_chk`. `GET /api/v1/crane-profiles/me/status` возвращает `{profile, memberships[], canWork}` для mobile screen routing. `authenticate.ts` скорректирован: org-status проверка теперь только для `role='owner'` (superadmin и operator вне primary org). Вопрос закрыт.

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

## Registration (from B2d-3)

### Resend OTP endpoint

Сейчас `/registration/start` подчиняется тому же cooldown'у (1/60s per phone), что и `/auth/sms/request` — чтобы запросить повторный код, клиент ждёт 60 секунд и дёргает `/start` ещё раз. Это работает, но UX-неочевидно: таймер на экране, кнопка «Отправить ещё раз», потом ошибка 429 если юзер забыл подождать.

Post-MVP — `POST /api/v1/registration/resend` как explicit action: тот же rate-limit, но с human-readable error сообщением «подождите N секунд» + возможно кнопка disabled до истечения cooldown. Не блокер — текущий `/start` покрывает функциональность.

Триггер: первый UX-report от заказчика или пользовательской группы.

### Re-registration after profile rejection

Сейчас если superadmin отклонил crane_profile, у user'а остаётся запись в `users` + `crane_profiles{approvalStatus:'rejected'}`. Phone и ИИН заняты — повторная регистрация с теми же данными даст 409. Для легитимного кейса «приложили неправильные документы, исправили, хотят попробовать снова» нужен отдельный flow.

Post-MVP options:
- **Soft-delete + new registration:** superadmin при reject'е также soft-delete'ит profile (освобождая ИИН) + user (освобождая phone). Registration flow работает как есть. Минус — `users.id` разный, нет continuity audit.
- **Re-submit endpoint:** `POST /api/v1/crane-profiles/me/resubmit` — operator меняет identity-поля (ФИО/ИИН/specialization) на rejected-profile'е и переводит обратно в `pending`. Continuity сохраняется, но требует расширения state machine (rejected → pending transition, сейчас запрещён).

Триггер: первый реальный отказ + запрос на повторную регистрацию.

### SMS templates i18n (RU / KZ)

Сейчас текст SMS hardcoded в `DevStubSmsProvider` / `MobizonSmsProvider`. Пользователь выбирает язык мобилки, но OTP-SMS приходит на том языке, который заложил backend. Для казахско-язычных крановщиков — UX-проблема.

Post-MVP:
- `users.preferred_language` (общая backlog-item, см. Operators выше) — источник языка.
- Но в registration flow user'а ещё нет (start вызывается ДО insert). Решение — брать язык из заголовка `Accept-Language` или из body (`{phone, lang: 'ru' | 'kz'}`).
- Templates: `ru: "Ваш код для регистрации Jumix: XXXXXX"`, `kz: "Jumix-ке тіркелу коды: XXXXXX"`.

Триггер: запрос от заказчика или пользовательской группы.

### Mobizon integration completion

Сейчас `/registration/start` использует тот же `SmsAuthService`, что и login-flow — если `MOBIZON_API_KEY` задан, провайдер реальный, иначе `DevStubSmsProvider` пишет в лог. Production блокирован на заказчике (получение Mobizon account + API key + sender name).

Триггер: заказчик выдаёт Mobizon credentials.

### Per-IP limit tuning for production

Текущий лимит — 20 SMS-запросов в час с одного IP. Это разумно для mobile traffic через operator LTE (разные клиенты с разными IP), но может быть жёстким для корпоративной сети (вся компания за одним NAT'ом). Для registration flow это особенно чувствительно: onboarding партии крановщиков из офиса компании → 21й отправка 429.

Post-MVP options:
- Поднять лимит до 50/hour (достаточно для любых legitimate use cases, всё ещё ловит спам-боты).
- Whitelist известных корпоративных IP'шников (от заказчика).
- Отдельные лимитеры для `/registration/*` vs `/auth/sms/*` — сейчас один shared.

Триггер: первый реальный 429-report от legitimate пользователя.

---

## License document flow (from B2d-4)

### Notification delivery — push/SMS для expiry warnings

`LicenseExpiryWorker` пишет audit `license.warning_sent` {variant, expiresAt} и проставляет `warning_*_sent_at` флаги, но **фактическую доставку** push/SMS не делает. В MVP это достаточно: mobile считает `licenseStatus` на boundary и показывает красный бейдж при `expiring_critical`/`expired`, оператор видит при открытии приложения.

Post-MVP — когда появится notifications-слой (push через FCM + fallback SMS через Mobizon):

- Worker после транзакции UPDATE+audit вызывает `notifications.send({userId, template: 'license.expiring_30d' | 'license.expiring_7d' | 'license.expired', variables: {expiresAt, profileId}})`.
- Идемпотентность уже обеспечена `warning_*_sent_at` (повторный run skipped).
- SMS-fallback если push failed (мобилка не онлайн 24 часа — оператор мог удалить приложение).

Триггер: готовность notifications-модуля (Этап 4 ТЗ — рейтинги + запуск).

### Retention policy для старых версий license

Сейчас `crane-profiles/{id}/license/v{N}/{file}` — все версии остаются в bucket навсегда. Compliance требует хранить документ, который был валидным на момент смены (спор о праве на работу). Но через 5 лет хранить v1 от 2026 — overkill.

Post-MVP:
- MinIO lifecycle rule: удалять объекты в `crane-profiles/*/license/v*/` с `age > N лет` (N согласовать с юристом — типично 3-5 лет).
- ИЛИ: retention через БД — `license_versions` таблица (версия + дата expired + reference на object), cron удаляет expired-старше-N-лет.

Триггер: consultation с юристом заказчика по compliance OR bucket превысит 10 GiB license data.

### Orphan cleanup — presigned-но-не-confirmed объекты

Оператор получил `/me/license/upload-url`, PUT'нул файл, но `/confirm` не вызвал (сеть пропала, crash, забыл). Объект остаётся в bucket без ссылки в БД.

Post-MVP:
- MinIO lifecycle: удалять объекты в `crane-profiles/*/license/v*/` с `last-modified > 24h` и без matching row в `crane_profiles.license_key`. Нужен cron reconciler (MinIO lifecycle сам не умеет фильтровать по внешней БД).
- ИЛИ: client retry (mobile при следующем запуске проверяет local pending confirm и шлёт).

Триггер: bucket начинает расти быстрее чем количество подтверждённых license.

### Upload rate-limit

Общий API rate-limit покрывает презентационный abuse. Но оператор может spam'ить `/me/license/upload-url + confirm` (каждый confirm — новая версия + объект). Не критично для MVP (объём мал), но:

Post-MVP: `1 успешный confirm / 24h / crane_profile`. Реализация через `@fastify/rate-limit` с custom key `license:${profileId}`.

Триггер: первый реальный случай злоупотребления или заказчик решит ограничить частоту.

### Multi-document extension — медосмотр, СИЗ-журнал, допуски

MVP: один документ (license). Когда появится второй (медосмотр — уже в ТЗ §5.1.5.1 упоминается), rule of three сработает:

- Вынести в `crane_profile_documents {id, crane_profile_id, kind, version, key, expires_at, warning_*_sent_at, ...}`.
- `LicenseExpiryWorker` → `DocumentExpiryWorker` с фильтром по kind.
- `canWork` gate расширяется: все required документы должны быть valid.

Триггер: ТЗ-допсоглашение с заказчиком про второй документ ИЛИ новая вертикаль в post-MVP.

---

## Web (from B3-UI-1)

### Auth-token storage: localStorage → HttpOnly cookies

MVP хранит `{accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, user}` в localStorage через `zustand/persist` (key `jumix-auth`). Это приемлемо для staging + контролируемого пилота, но уязвимо к XSS: любая inject-уязвимость на домене даёт атакующему полный refresh-token.

Миграция — связана с backlog `Auth / Web cookie mode`: как только backend добавит cookie-path для `/auth/*` (CLAUDE.md §5.2), клиент:

- Удаляет `accessToken`/`refreshToken` из persisted state; `fetch` делается с `credentials: 'include'`.
- Auth store хранит только `user` + derived `isAuthenticated` (проверяется через `GET /auth/me` при старте).
- Refresh-single-flight остаётся, но без явной передачи токена — сервер ставит новые Set-Cookie.

Триггер: готовность backend cookie-flow.

### Light theme

Сейчас принудительно `className="dark"` в `<html>`. Дизайн-система описывает только dark-палитру. Light-вариант потребует: (а) расширить `@theme inline` в `globals.css` (+ второй набор токенов), (б) ThemeProvider с persisted preference, (в) manual QA всех скринов.

Триггер: реальный запрос от заказчика ИЛИ accessibility-требование.

### KZ locale (полноценный)

`src/messages/kz.json` — placeholder (копия ru). Для полного KZ потребуется: (а) перевод всех strings (native reviewer), (б) locale switcher в topbar + persist, (в) переключение `Intl.*`-форматирования дат/чисел, (г) Accept-Language-based defaulting для unauthenticated-users.

Зависит от backlog `Registration / SMS templates i18n` и `Operators / Preferred language` — единое решение про язык пользователя.

Триггер: Этап 3/4 ИЛИ запрос от заказчика.

### Real-time notifications (WebSocket / SSE)

MVP — polling через React Query `refetchOnWindowFocus`. Для live-карты смен (Этап 2) и push-событий (Этап 4) потребуется двусторонний канал:

- SSE (проще, one-way) — достаточно для большинства «update nudge» кейсов.
- WebSocket (full-duplex) — если появится чат / real-time collaboration.
- Fallback на long-polling для клиентов за строгими proxy.

Триггер: Этап 2 — live-карта смен.

### Visual regression tests

Сейчас тесты — unit only (Vitest + Testing Library). Compound UI-регрессии (поломался flex в sidebar, сдвинулся header) проверяются manual smoke. Для долгого lifetime проекта нужен visual snapshot tool:

- **Chromatic** (на базе Storybook) — платный, но де-факто standard.
- **Playwright + pixelmatch** — бесплатный, требует самостоятельной infrastructure.
- **Percy / Applitools** — коммерческие альтернативы.

Триггер: > 3 accidental визуальных regression'а за месяц ИЛИ onboarding второго разработчика в UI.

### E2E tests (Playwright)

Unit покрывает компоненты, но не flow (login → verify → dashboard). E2E нужны на happy path: SMS login, password login, forbidden redirect на `/login`, Cmd+K, переключение sidebar ↔ drawer на resize.

Триггер: первая регрессия на auth-flow ИЛИ Этап 2 (shifts UX — больше interactive flow).

### Accessibility audit

WCAG 2.1 AA — цель, но не проверено автоматически. Текущий стек частично покрывает (Radix primitives follow WAI-ARIA), но общая страница не прогонялась через axe/Lighthouse/manual screen-reader.

Post-MVP:
- `@axe-core/react` в dev-режиме (логи в консоль на каждый render).
- Lighthouse CI gate на PR'ах.
- Manual VoiceOver pass по всем screen'ам перед каждым major release.

Триггер: accessibility-требование от заказчика ИЛИ public launch.

### Advanced mobile: offline-режим, install prompt, native share

Веб на мобиле сейчас — just responsive. Для guest-level мобильного UX (суперадмин / owner с телефона) можно улучшить:

- **Service worker** для offline shell + кешированных GET'ов.
- **PWA install prompt** (`beforeinstallprompt`) с нативной кнопкой «Добавить на домашний экран».
- **Native share / clipboard integration** — через Web Share API для marketplace-ссылок.
- **Background sync** — queued mutations когда сеть падает.

Существенное усложнение, не MVP. Триггер: реальные запросы от admin-пользователей на «работу в поле с плохой связью».

---

## Web — list pages (from B3-UI-2c)

### IntersectionObserver trigger для infinite load

Сейчас `DataTable` рендерит кнопку «Загрузить ещё» когда `hasMore`. Это consciously минималистично — предсказуемо, не ест bandwidth случайно. Post-MVP — IntersectionObserver на sentinel-row, который автоматически тянет next page когда приближается к bottom. Требует debounce против prefetch-storm'а и fallback для старых браузеров.

Триггер: UX-фидбек заказчика «хочу scroll-to-load» ИЛИ >200 rows типичный case.

### Server-side license filter

`crane_profiles` list-page сейчас фильтрует по `licenseStatus` client-side (`useMemo` поверх страницы). `licenseStatus` computed на boundary из `license_expires_at` и `license_key` — SQL-фильтр возможен, но требует duplicate'а логики `computeLicenseStatus` (5 состояний с датами now + 7d + 30d).

Post-MVP: API-param `?licenseStatus=expired|expiring_critical|...` → repository переводит в SQL-WHERE с тем же пороговыми датами что и `computeLicenseStatus`. Нужна общая функция (shared между backend SQL и frontend computed).

Триггер: типичная организация имеет > 50 крановщиков И фильтр по лицензии становится primary use-case.

### Server-side crane type filter

Аналогично license — `cranes` page фильтрует `type` client-side. Backend API уже принимает `search`, `approvalStatus`, `status`, но НЕ `type`. Добавить `?type=tower|crawler|...` и использовать вместо `useMemo`.

Простой change (enum-поле, прямой WHERE). Триггер: rule of three — когда появится третий client-side фильтр с похожим паттерном, унифицировать все три.

### Virtualized rows

`DataTable` рендерит все строки напрямую. При 500+ строк (большая org с десятками крановщиков × десятками кранов) — scroll jank и memory pressure. Post-MVP — TanStack Virtual или react-window.

Триггер: реальный case с >500 rows на одной странице ИЛИ жалоба на лаги.

### Bulk actions (select multiple + batch approve/reject)

Сейчас approve/reject — по одной entity через drawer. При onboarding'е нового тенанта superadmin может одобрять десятки crane_profiles + hires подряд. Bulk UI: checkbox в DataTable + sticky action bar «Одобрить выбранные (N)».

Триггер: реальный pain-point при onboarding'е крупного клиента ИЛИ заказчик запросит.

### URL-state via nuqs вместо ручного setParam

Ручной `setParam` helper дублируется на каждой page (идентичная реализация). Когда появится 6+ pages с этим паттерном — мигрировать на `nuqs` (typed URL-state helpers для App Router). MVP — оставляем inline, потому что 4 page × 10 строк < overhead библиотеки.

Триггер: 6+ pages ИЛИ первая регрессия из-за рассинхрона реализаций.

---

## Web — dashboard audit-feed + palette (from B3-UI-2d)

### Audit events — payload stability contract

Registry `lib/format/audit.ts` содержит ~30 mapped action-типов. По мере роста backend'а (добавление новых событий в `auditLog`) registry будет отставать — новый action отрендерится через fallback (Clock icon + action-string as-is). Сейчас это acceptable: UI не ломается, просто выглядит менее informative.

Post-MVP options:
- **Source of truth — backend:** endpoint `GET /api/v1/audit/actions/registry` возвращает `{action, label_key, icon_hint}`-словарь. Frontend подтягивает на старте + кеширует.
- **Compile-time union type:** audit-actions типизируются в `@jumix/api-types` как literal union, TypeScript проверяет compleiteness registry'а (exhaustiveness switch).

Триггер: rule of three — когда появится третий недостающий action в registry (сейчас видно только на QA-обзорах).

### Real-time audit feed через SSE

`RecentActivity` сейчас — polling через React Query staleTime 30s. Для superadmin real-time dashboard'а (видеть события по мере появления) — SSE-stream `GET /api/v1/audit/stream` с server-sent события. Клиент держит eventsource + мёрджит в query-cache.

Связано с общей backlog-item `Web / Real-time notifications (WebSocket / SSE)`.

Триггер: superadmin жалуется на «надо F5 чтобы увидеть новые события» ИЛИ появление live-карты смен (Этап 2).

### Command palette shortcuts — binding за пределами Cmd+K

Сейчас доступен только Cmd+K toggle. `CommandEntry.shortcut` — metadata для UI (показываем `kbd` бейдж в row), но не wire'им клавиши глобально. Post-MVP:
- Global binding через `useKeyboard` (уже есть hook): Cmd+Shift+D → dashboard, Cmd+Shift+O → organizations, etc.
- Конфликты с браузерными shortcut'ами проверять явно (e.g., Cmd+S занят save-as).

Триггер: superadmin-фидбек «хочу навигацию с клавиатуры».

### Command palette — recent / pinned commands

Сейчас команды в фиксированном порядке по `COMMAND_GROUP_ORDER`. Post-MVP — «Недавние» группа сверху (localStorage с последними 3 execute'ами) + «Закреплённые» (user-pinned через command menu). cmdk поддерживает custom sort через filter function.

Триггер: 10+ команд в registry → scroll по списку становится pain-point.

---

## Web — owner cabinet + maps (from B3-UI-3a)

### Protomaps self-hosted tile service

На MVP карта использует CARTO Dark raster tiles через публичный CDN (`basemaps.cartocdn.com`) — работает без API key, но зависимость от third-party и нет гарантий uptime/latency для РК. Post-MVP — развернуть Protomaps PMTiles на нашей инфраструктуре (Hetzner VPS + nginx raw-range или CloudFlare R2) + vector style (Positron/Dark variants). Даёт control над стилизацией, нет внешних зависимостей, дешевле чем MapBox/Maptiler commercial plan.

Триггер: жалобы на latency с РК-IP или первое падение CDN в прод.

### Server-side site filtering — computed fields

`GET /api/v1/sites` сейчас фильтрует только по `status` + `organizationId`. На owner-кабинете (B3-UI-3a) client-side фильтры минимальны, но когда добавим поиск по имени/адресу, координатам-радиусу от центра карты — нужно переносить на server. Паттерн тот же что §Server-side license filter.

### Reverse geocoding в MapPicker

Сейчас MapPicker показывает только coordinates (`51.169, 71.449`). UX-улучшение — fetch reverse-geocode от OSM Nominatim / CARTO Geocoder → отображать human-readable address под координатами («ул. Абая, 15, Астана»). Rate-limit Nominatim 1 req/sec — нужен debounce + cache. Backlog: в связке с Protomaps выбрать final провайдера.

### Custom archive confirmation dialog

`SiteDrawer` использует native `confirm()` для подтверждения архивирования — работает везде, но визуально отличается от остального dialog-стека и не i18n. Заменить на кастомный `ConfirmDialog` (Radix AlertDialog wrapper) когда появится второй use-case (delete-org, terminate-hire).

---

## Web — owner cranes (from B3-UI-3b)

### Server-side crane type filter

`/my-cranes` сейчас делает client-side `all.filter((c) => c.type === type)` после загрузки страницы — на больших парках (200+ кранов) приведёт к фрагментированной пагинации (страница из 20 может схлопнуться в 3 после фильтра). Перенести `type` в `GET /api/v1/cranes` query (тот же паттерн что approval/status). Триггер: jumping pagination на demo'шке заказчика.

### CranesLayer — picker для группы

При нескольких кранах на одном site (group >1) клик по маркеру открывает первый из списка. Корректный UX — picker (popover со списком моделей или mini-list, выбор → drawer на конкретный crane). Backlog до тех пор пока realistic-нагрузка не покажет «у нас по 3-5 кранов на объекте». Альтернатива — вместо одного маркера с badge'ем рисовать N маркеров со спиральным offset (cluster-style); сложнее, но не теряет clickable per-crane.

### CraneDrawer — bulk actions

Сейчас `assign-to-site` / `setStatus` делают per-crane мутации. Backlog: select-multiple на `/my-cranes` (checkbox column в DataTable) + batch endpoints `POST /api/v1/cranes/bulk/{assign,activate,maintenance,retire}` body `{ids[], siteId?}`. Триггер: жалоба заказчика на ручную работу при сезонной перевозке кранов.

### Owner stats — расширение метрик

`OwnerDashboardStats` сейчас содержит `{active:{sites,cranes,memberships}, pending:{cranes,hires}}`. Естественные дополнения по мере появления модулей: `pending.licenseExpiring` (B2d-4 + B3-UI-3c), `monthlyHours` (после shifts/Этап 2), `expensesThisMonth` (после payroll). Каждое расширение — backward-compatible add-only поле (existing UI ignored).

### Owner approve-self — anti-pattern doc

`crane.policy.canApprove` блокирует owner'а одобрять свои же заявки (rule #11 + ADR 0002). Это инвариант холдинговой модели — внешний актор обязателен. Если заказчик попросит «можно я сам себе одобрю краны, для скорости» — отказ + ссылка на ADR 0002. Если заказчик настаивает (один-человек-холдинг кейс) — нужен явный feature flag `org.allow_self_approval = true` через миграцию + аудит-event с особой меткой; **по умолчанию выключено**, ручной enable суперадминистратором.

### CranesLayer — heatmap для retired

При накоплении исторических данных (1+ год эксплуатации) полезно видеть «карту тепла» retired/maintenance кранов — где исторически выходили из строя, что коррелирует с типом грунта/площадки/застройщика. Слой опционально включается через filter chip «История» в `/my-cranes`. Не для MVP — нужны annual-cohort'ы.

---

## Web — owner hires + operators (from B3-UI-3c)

### Hire request cancellation

Owner может только ждать решения superadmin'а после submit'а hire-request'а. Для UX «я передумал нанимать этого человека» нужен `DELETE /api/v1/organization-operators/:id` на pending-hire (уже работает в backend — `canDelete` разрешён во всех approval-state'ах) + UI кнопка «Отозвать» в drawer pending-hire + подтверждение. Триггер: явная просьба заказчика или подряд несколько «а как мне отменить заявку».

### Rejected hires visibility

Сейчас `/hire-requests` фильтрует только `approvalStatus='pending'`; rejected записи скрыты. Нужен либо dedicated tab («Отклонённые» — показать причину отказа superadmin'а, owner видит rejectionReason), либо dedicated page `/hire-requests/archive`. Без UI они накапливаются «в никуда». Триггер: более 20 отказов на демо-account'е заказчика.

### Block reason audit trail

Backend пишет `organization_operator.block` с `metadata.reason` в audit_log при блокировке. Но UI сейчас эту причину не отдаёт в drawer. Нужен «История блокировок» accordion в drawer с last N audit-events по этому hire'у (или dedicated `/my-operators/:id/history` page). Зависит от `audit.recent` backend endpoint'а — он уже есть, но пока superadmin-only; нужно расширить policy или сделать `/my-operators/:id/audit` owner-scoped.

### Operator-site assignment

Currently organization_operator никак не связан с site'ом — это логическая связь, которая появится когда крановщик встанет на смену. Shift-endpoint (Этап 2) вводит `shifts(id, organization_operator_id, site_id, started_at, ended_at)`. После этого появится mini-feature: в drawer'е `OrganizationOperatorDrawer` показывать «Последняя смена: <site>, <time>», в drawer'е `SiteDrawer` — «Назначенные крановщики». Не доступно до shifts.

### Phone search в crane-profile list

`GET /api/v1/crane-profiles?search=<q>` сейчас ILIKE'ит на `firstName/lastName/iin`. Для поиска по номеру телефона (ввод без `+7`-префикса, partial match) нужен `OR phone LIKE '+7' || $search`. Не для MVP — IIN/name достаточно. Триггер: owner жалуется что не может найти крановщика по номеру карточки.

### Owner cancel before superadmin decision — soft-delete vs hard

Если добавим «Отозвать заявку» (см. выше), нужно решение: soft-delete (`deleted_at=now`, history preserved) или hard-delete (страница чистая). Leaning to soft-delete (audit-trail priority) + отдельная policy `canCancel` = `isOwner && hire.organizationId === ctx.organizationId && approval_status === 'pending'`.

---

## Web — operator cabinet (from B3-UI-4)

### Identity edit request flow

Operator не может править свои ФИО/ИИН — это требует re-approval (смена ИИН = potentially разный человек). Нужен flow: operator submits change-request → `crane_profile.approvalStatus` flips back to pending + `previousApprovalStatus` snapshot → superadmin reviews diff + approves/rejects. Zero UI ship в MVP (редкая операция — люди не меняют ИИН часто). Триггер: user error при regstrации + запрос поменять.

### Phone change with SMS re-verification

Backend `/me/phone-change` endpoint не существует. Новый phone → send OTP → verify → update `users.phone`. Нужен для operator user-story «поменял номер». Dependency: extend SmsAuthService с новым flow. Backlog до B3-UI-4 post-MVP feedback.

### Avatar upload UI для operator

Backend endpoint `POST /me/avatar/upload-url` + confirm уже работают (B2d-2a). UI surface для operator — minimal priority (cosmetic, не блокирует work). Мobile app добавит (self-profile screen). Web сейчас read-only — показывает avatar если загружен через mobile, но upload UI отсутствует. Триггер: заказчик просит «нашим крановщикам нужно поставить фото с web».

### License version history

Backend сохраняет все версии (key pattern `crane-profiles/{id}/license/v{N}/filename`), но UI показывает только current. Нужен «История удостоверений» section на `/license` page — список previous versions с upload dates, optional access к старым файлам. Для compliance audit важно. Retention policy для старых версий — отдельный backlog item (см. Storage §4).

### Re-registration after profile rejection

ADR 0004 backlog: operator с `approvalStatus='rejected'` сейчас не может submit новую registration (IIN conflict). Нужен admin-only un-reject endpoint или soft-delete previous + new registration. UI-side: `/me` для rejected operator показывает rejection reason + link «Подать заявку заново» (disabled + backend-blocked в MVP).

### Operator-side license warning notifications

Backend cron `license-expiry-scan` uploads warnings в audit_log но push-уведомления крановщику — backlog (notifications module). Когда появится — web `/license` should show «Push-уведомление отправлено» badge на warning. Mobile-primary, но web consistency.

### `canWorkReasons` localization / i18n

Сейчас reasons — plain strings на русском, computed в backend service. Когда добавится KZ locale (post-MVP), нужен один из:
- Перенести reasons в i18n keys на frontend (`me.canWork.reasons.profilePending`) — backend отдаёт enum-like strings, фронт переводит
- Backend принимает `Accept-Language` header и возвращает localized

Leaning to first approach — UI responsibility, backend stays pure data.

---

## Mobile (from M1 + M2)

### Skeleton shimmer animation

M2 ship'нул static skeleton (plain `View` с `colors.layer3` bg) — читается как loading благодаря shape + позиционированию. Shimmer pulse (Reanimated-based `useSharedValue + withRepeat` opacity 0.3 ↔ 0.7) — polish. Проблема: `react-native-reanimated` worklets не работают в jsdom (vitest env), тесты упадут. Решение когда делать: wrap Skeleton в `Platform.select({web: static, native: animated})` ИЛИ мокать reanimated в `tests/setup.ts` по polyfill-паттерну. До тех пор — static acceptable.

### SVG icons + Lucide (hoist из M1-backlog)

M2 продолжает использовать emoji-глифы (`✓`, `!`, `🏢`, `⚠`) как placeholder icons — работает но несогласовано с web'овыми Lucide иконками. Миграция: `lucide-react-native` (peer `react-native-svg`) — один импорт на весь app. Gate перед M8 polish. Triggers: UI review с заказчиком, стилистическое выравнивание с web.

### Identity edit request flow (mobile UI)

M2 показывает identity read-only на /me screen (мобилка + web identical limitation). Edit identity требует re-approval через superadmin'а (rename / IIN change invalidate старые documents). Backlog: mobile screen «Запросить изменение данных» с motivation textarea → creates pending `identity_change_requests` row → superadmin approve/reject → на approve обновляет `crane_profiles` и resets hire approvalStatus. Backend API ещё нет. Параллель — web backlog entry "identity edit flow" (B3-UI-4).

### Avatar upload UI (mobile)

Backend endpoint готов с B2d-2a (`POST /me/avatar/upload-url` + `/me/avatar/confirm`, platform key `crane-profiles/{id}/avatar/...`). Mobile UI нет — Avatar показывает backend-stored URL read-only или инициалы. Gate: когда UX dictate'ит кастомизацию (заказчик попросит / полевой feedback). Implementation: `expo-image-picker` (camera + library), crop 1:1, compress (JPEG q=0.8), PUT → confirm → invalidate meStatus.

### Membership individual endpoint

Currently `/memberships/[id]` detail screen берёт membership из `useMeStatus` cache (memberships array). Если operator имеет 100+ hire-записей — payload большой, всё загружается для detail screen. Backlog: `GET /api/v1/organization-operators/[my-hire-id]` endpoint с operator-scoped policy (operator может читать только свои hires). Триггер: когда типичный operator будет иметь > 10 active/historical memberships.

### Rejected/terminated filter в /memberships list

M2 показывает все memberships (approved + pending + rejected + terminated) в одном списке — для MVP достаточно, но UX может потребовать tabs (активные / история). Gate: user-feedback post-launch.

### Expo SDK 55 upgrade

M1-fix shipped на Expo 54 + RN 0.81 + React 19.1 (official default от `create-expo-app` как of April 2026). SDK 55 released Feb 2026 (RN 0.83, React 19.2) — `latest` npm dist-tag уже `55.0.17`, но Expo Go app в App Store и default template ещё на 54 (Expo team gates transition до full ecosystem coverage). Upgrade path: когда `create-expo-app` default сменится на 55 и Expo Go обновится — отдельная миграция с полной регрессией на iOS + Android + real device. Breaking changes SDK 55 (уточнить в release notes при миграции): Legacy Architecture removed (`newArchEnabled: true` становится обязательным), `@expo/ui` API changes (DateTimePicker → DatePicker, etc), Expo Modules Core Swift 6 upgrade. Триггер: когда Expo Go в App Store обновится на 55 (до этого real device testing через 55 невозможен без dev build).

### Phone number edge cases

Current: `phoneDigits` strips leading 7/8 если длина ≥ 11. Не покрыто:
- Пробелы/дефисы в middle input (backspace странное поведение)
- Copy/paste international format (+1...) — сейчас silently strip non-digits
- `x8 701` (short spaces) — работает, но placeholder UI не подсказывает
Backlog: polish phase в M8 перед TestFlight.

### OTP autofill real-device testing

jsdom не симулирует iOS SMS autofill из incoming message, Android SMS Retriever API. Unit tests проверяют markup (`textContentType='oneTimeCode'`, `autoComplete='sms-otp'`). Actual autofill validation — manual QA на physical devices: iPhone (iOS 17+) + Samsung/Pixel (Android 13+). Gate перед M8 release.

### Real-device testing infrastructure

Currently тестируем manually через Expo Go. Backlog:
- **Detox** / **Maestro** e2e automation — CI runs на BrowserStack App Live (paid) или simulator matrix
- Device farm rotation (iPhone SE-15, Pixel-Samsung Android 10-15) — Xcode Cloud / Firebase Test Lab
- Accessibility audit (iOS Accessibility Inspector, Android TalkBack) — pre-release checklist

### OTA updates (EAS Update)

Expo EAS Update — push JS bundles без App Store review (критично для hotfixes между releases). Backlog: configure в M8 вместе с EAS Build pipeline. Channel strategy: `production` (stable) / `staging` (internal testing) / `preview` (new features behind flag).

### Biometric unlock (FaceID / TouchID)

After initial SMS login, защитить app re-open через biometrics — `expo-local-authentication`. Lookup: если user есть в store + last active < 7 дней + biometrics enrolled → FaceID challenge вместо logout-on-foreground. UX improvement, не blocker.

### Offline-first data layer

Critical для M5 (GPS tracking во время смены — сеть может пропадать на стройках). General pattern starts M4:
- Mutation queue (persist queued requests → retry on connectivity)
- Local cache (SQLite или MMKV) для shifts list / profile
- Optimistic UI с conflict resolution (последний writer wins + audit)

### Dark/light theme toggle

Currently dark-only (matches web). Light theme — backlog, low priority: работа крановщика на улице в солнце — light theme читается хуже чем dark. Если заказчик настоятельно попросит — в M8 polish.

### Push notifications (M7 placeholder)

FCM через `expo-notifications`. Topics: license expiring warnings, shift assigned, incident updates. Permission flow: onboarding после первого login → Apple/Android permission prompt. Silent notifications для background GPS — отдельное разрешение iOS. Backlog до M7.

### i18n

Currently ru-only. KZ (казахский кириллица) — target secondary locale когда заказчик запросит. `i18next` + `react-i18next` + `@formatjs/intl-messageformat`. Lazy-load locales. Backlog до M8.

### Lucide / SVG icons

Tab bar сейчас emoji (👤🪪🏗️). Real SVG icons — `lucide-react-native` или `@expo/vector-icons`. Backlog в M2 (когда начнём serious UI polish).

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
