# ADR-0004: Public SMS registration flow for crane operators

- **Дата:** 2026-04-22
- **Статус:** Accepted
- **Автор:** Yerbol
- **Scope:** B2d-3. Дополнение к ADR [0003](0003-operators-multi-org-model.md):
  канонический путь появления нового `crane_profile` на платформе —
  самообслуживание через мобильное приложение, а не только owner/admin
  создание через веб.

## Контекст

ТЗ §5.2.2 описывает мобилку как основную точку входа крановщика: человек
скачивает приложение, вводит телефон, получает SMS, вводит код и данные
(ФИО, ИИН) и попадает в систему. Админский path (owner создаёт профиль
сам — `POST /api/v1/crane-profiles`) остаётся как запасной (§5.1.5 ТЗ).

ADR 0003 pipeline 1 зафиксировал, что `crane_profile` должен создаваться в
`approval_status='pending'` и ждать одобрения superadmin'ом до попадания
в пул найма. Регистрация через мобилку — единственный сценарий, где этот
pending-слот возникает без участия owner'а; значит handler должен быть
публичным (без `app.authenticate`), но с жёсткими защитами от злоупотребления
(SMS стоят денег; OTP — мишень для brute-force; дубликаты phone/ИИН
недопустимы).

Кроме того, к моменту коммита B2d-3 в `apps/api/src/modules/auth/sms/`
уже собран полный SMS-auth стек: `SmsAuthService` с 6-значным OTP,
5-минутным TTL, Redis-бэкендом кода (`RedisSmsCodeStore`), рейт-лимитами
(60s / 5 час / 20 IP час), constant-time сравнением и auth_events
аудитом. Он же обслуживает SMS-login (`/auth/sms/request` +
`/auth/sms/verify`). Реализовывать параллельный OTP-стек для регистрации
означало бы дублировать проверенный код — прямое нарушение CLAUDE.md
rule #1 («никогда не пиши auth-логику с нуля; используй packages/auth»)
и §3 rule #6 (Rule of three).

## Решение

### Переиспользуем существующий SMS-стек, добавляем только оркестрацию

Новый модуль `apps/api/src/modules/registration/` ограничивается:

- публичными endpoints `POST /api/v1/registration/start` и `POST
  /api/v1/registration/verify` (без `app.authenticate`);
- `RegistrationService`, который делегирует OTP и rate-limit в
  `app.authServices.sms` (`SmsAuthService.requestCode` / `.verifyCode`);
- транзакционной orchestration-ой на verify-шаге: user + crane_profile
  INSERT, audit_log, `tokenIssuer.issue()` для немедленной выдачи
  access + refresh токенов.

Мобильный клиент получает JWT сразу — оператор авторизован с момента
верификации, даже если профиль `pending`. Экран в приложении
определяется отдельным endpoint'ом `GET /api/v1/crane-profiles/me/status`
(см. §4 ниже).

### Двухфазный flow (start → verify+complete)

- **Start** `POST /api/v1/registration/start` — body `{phone}`. Нормализует
  телефон, прогоняет rate-limit checks, записывает OTP в Redis, отправляет
  SMS через `app.authServices.sms`. Возвращает 202 при успехе. OTP-код
  в ответ **не возвращается** — только в SMS.
- **Verify + complete** `POST /api/v1/registration/verify` — body
  `{phone, otp, firstName, lastName, patronymic?, iin, specialization?}`.
  Верифицирует OTP. Если код верный — проверяет отсутствие existing user
  по телефону (409 `PHONE_ALREADY_REGISTERED`) и отсутствие глобального
  дубликата ИИН (409 `IIN_ALREADY_EXISTS`). В транзакции создаёт
  `users` (role=`operator`, organizationId=`null`, phone нормализованный,
  name=«FirstName LastName»), затем `crane_profiles` (userId=user.id,
  approvalStatus=`pending`), затем `audit_log {action:'registration.complete'}`.
  Вне транзакции выпускает JWT pair через `TokenIssuerService.issue()`.
  Возвращает `{accessToken, refreshToken, expiresAt, craneProfile}`.

Почему verify-и-complete одним вызовом, а не три отдельных step'а:
клиент всё равно собирает ФИО/ИИН в форме одновременно с OTP-кодом
(UX — одна страница «подтверждение» после ввода SMS). Разделение
потребовало бы промежуточного temp-токена между verify и complete,
что усложняет клиент без выигрыша. Атомарность: либо user+profile
созданы с валидным OTP, либо нет.

### OTP, rate-limit, SMS — переиспользование auth/sms

- **OTP-код:** 6 цифр, 5-минутный TTL, crypto.randomInt. `MAX_VERIFY_ATTEMPTS
  = 5` (значение из `SmsAuthService`; отличается от 3, упомянутых в
  первоначальной B2d-3 записке — решили не расходиться с login-flow, т.к.
  брутфорс 6-значного кода за 5 попыток на Redis-backed rate-limiter всё
  равно практически невозможен).
- **Rate-limit:** используется тот же `SmsRateLimiters` инстанс, что и для
  login. 60-секундный cooldown per-phone, 5/час per-phone, 20/час per-IP.
  Это значит, что злоупотребление `/registration/start` ест тот же лимит,
  что и `/auth/sms/request`, — желательное поведение, иначе атакующий мог
  бы переключаться между endpoint'ами, чтобы удвоить квоту.
- **SMS provider:** тот же `SmsProvider` инстанс (`DevStubSmsProvider` в
  dev/tests; `MobizonSmsProvider` в prod с `MOBIZON_API_KEY`). Текст:
  `«Jumix: ваш код подтверждения {code}. Никому не сообщайте.»` (формат
  наследуется из login-flow; i18n — в backlog).

### User + crane_profile создание в транзакции

- `users_org_role_consistency_chk` constraint исходно требовал
  `organization_id NOT NULL` для любой роли кроме `superadmin`. Это
  блокировало операторскую запись без org. **Migration 0008** (этот
  коммит) ослабляет constraint: `operator` → `organization_id` может быть
  любым (мы создаём null; legacy-backfilled строки с org остаются
  валидными до отдельной очистки).
- Pre-check по phone (`UserRepository.findAnyByPhone`) + pre-check по ИИН
  (`CraneProfileRepository.findActiveByIin`) — user-facing 409 до INSERT.
  При race используется `PG unique violation (23505)` на
  `users_phone_key` / `crane_profiles_iin_unique_active_idx` —
  конвертируется в тот же 409.
- `audit_log.action='registration.complete'` с metadata `{phone: masked,
  craneProfileId, userId}`. OTP-код в metadata **не пишется**.

### /me/status — mobile screen routing

`GET /api/v1/crane-profiles/me/status` (operator-only, под
`app.authenticate`) отдаёт UI всё, что нужно для выбора экрана:

```json
{
  "profile": {
    "id": "uuid",
    "approvalStatus": "pending|approved|rejected",
    "rejectionReason": "string|null"
  },
  "memberships": [
    {
      "id": "uuid",
      "organizationId": "uuid",
      "organizationName": "string",
      "approvalStatus": "pending|approved|rejected",
      "status": "active|blocked|terminated"
    }
  ],
  "canWork": false
}
```

`canWork = profile.approvalStatus==='approved' && memberships.some(m =>
m.approvalStatus==='approved' && m.status==='active')`. Мобильный клиент
по этому flag'у решает — показать «ожидайте одобрения», «выберите
организацию» (если approved-memberships больше одной), «нет активных
назначений», или основной экран смен.

`organizationName` добавляется JOIN'ом — иначе клиент при `canWork=false`
показывал бы бесполезные UUID'ы в pending-membership state.

## Альтернативы

### 1. Email magic link вместо SMS

Отвергнуто. Большинство крановщиков в РК не используют email как primary
identity — ТЗ явно говорит про SMS. Infrastructure под SMS уже собрана
(Mobizon stub), под email — нет; добавление ради альтернативного канала
даёт null-value для MVP.

### 2. Three-phase flow (start → verify → complete)

Отвергнуто. Требует temp-токена между verify и complete, усложняет клиент.
Выигрыш — теоретическая возможность «проверить код сейчас, заполнить форму
потом», который противоречит UX мобильной регистрации (всё на одном
экране).

### 3. Пропустить ФИО/ИИН в registration, заполнять через /me/PATCH

Отвергнуто. Тогда pending-профиль у superadmin'а — безымянный, нечего
одобрять. К моменту верификации код уже потрачен — если клиент забыл
ФИО в форме, пришлось бы запускать новый SMS-цикл (перерасход квоты).

### 4. License upload (удостоверение) на этапе registration

Отложено. Documents — отдельная сущность с expiry cron (B2d-4). Registration
создаёт базовый identity; документ добавляется отдельно, чтобы
стартовый путь был максимально коротким (фото удостоверения — лишний
блокер для первого запуска клиента).

### 5. Реализовать отдельный пакет `@jumix/sms` и новый `OTPService` для
   регистрации

Отвергнуто. Существующий `SmsAuthService` покрывает всю функциональность
(generate / store / verify с attempts limit / audit). Дублирование
нарушило бы CLAUDE.md rule #1 (auth-логику не писать с нуля) и Rule of
three: у нас всего два потребителя OTP (login + registration), общий
сервис их обслуживает. Когда появится третий канал (например, email 2FA)
— будет повод выносить OTP в shared abstraction.

### 6. Новый Redis-backed sliding-window rate limiter в `apps/api/src/lib/`

Отвергнуто по той же причине: `@jumix/auth`/`RedisRateLimiter` +
`MemoryRateLimiter` уже собраны и покрыты тестами. Регистрация использует
тот же лимитер — общий лимит для SMS-канала защищает от cross-endpoint
bypass'а.

## Последствия

### Положительные

- Мобильный клиент получает каноничный registration flow без админского
  создания профилей (§5.2.2 ТЗ closed).
- Migration 0008 делает users-constraint согласованным с
  `accessTokenClaimsSchema` (operator → org=null) — устраняет
  несоответствие между DB и JWT.
- Пара `/me/status` + pending-aware JWT позволяет мобилке корректно
  маршрутизировать экраны до одобрения профиля, без отдельного «гостевого»
  токена.
- SMS-канал защищён едиными лимитами (login + registration используют
  тот же лимитер, cross-endpoint bypass невозможен).

### Отрицательные

- Registration и login делят OTP-store на один и тот же
  `phone` — если пользователь одновременно запустил `/auth/sms/request`
  (попытка войти) и `/registration/start`, второй вызов перетрёт код
  первого (put перезатирает). В MVP это OK: login с несуществующего
  номера всё равно вернёт 403 `USER_NOT_REGISTERED`; реальный пользователь
  сначала регистрируется, потом логинится. Edge case — в backlog.
- `MAX_VERIFY_ATTEMPTS=5` ≠ «3» из первоначальной B2d-3 записки. Это
  явный trade-off ради переиспользования.
- Mobizon остаётся stub'ом — регистрация в prod потребует настройки
  `MOBIZON_API_KEY`. Это deployment concern, не архитектурный.

### Не решено (backlog)

- **Re-registration после reject'а:** сейчас повторная попытка с тем же
  phone вернёт 409 `PHONE_ALREADY_REGISTERED`. Нужен admin-path «unblock
  phone» (soft-delete rejected-user) или автоматическая разблокировка.
- **Phone change flow:** оператор сменил номер — backlog.
- **Resend OTP counter:** сейчас каждый `/start` = новый OTP (put
  перезатирает старый). «Resend без перевыпуска при живом коде» —
  backlog.
- **i18n SMS text:** RU hard-coded. KZ-вариант — backlog (ТЗ требует
  двуязычие, но deployment-ready SMS провайдер пока не подключён).
- **Real Mobizon HTTP integration:** ожидает prod deployment с реальным
  API-ключом.
- **IIN ownership dispute / merge** — уже в backlog ADR 0003.

## Связанные документы

- [ADR 0002](0002-holding-approval-model.md) — базовый holding-approval
  паттерн.
- [ADR 0003](0003-operators-multi-org-model.md) — two-pipeline operator
  модель, pipeline 1 = crane_profile approval.
- [authorization.md §4.1](../authorization.md) — публичные endpoints.
- [authorization.md §4.2a](../authorization.md) — self-scope invariants
  (применимо к `/me/status`).
- `apps/api/src/modules/auth/sms/` — переиспользуемый SMS auth стек.
- `packages/auth/src/rate-limit/` — Redis/Memory rate limiter.
- `apps/api/src/integrations/mobizon/sms-provider.ts` — SmsProvider
  abstraction (DevStub + Mobizon stub).
