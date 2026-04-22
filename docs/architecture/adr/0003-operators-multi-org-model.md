# ADR-0003: Multi-org operator model — crane_profiles + organization_operators

- **Дата:** 2026-04-22
- **Статус:** Accepted
- **Автор:** Yerbol
- **Scope:** B2d (operators refactor). Этот ADR — архитектурный, реализуется в
  четырёх вертикалях: B2d-1 (схема + AuthContext), B2d-2 (split модуля на
  crane-profile + organization-operator), B2d-3 (public SMS регистрация +
  hire-approval), B2d-4 (документы + expiry cron — см. ADR
  [0005](0005-license-document-flow.md)). **Все четыре вертикали закрыты
  по состоянию на 2026-04-22.**

## Контекст

В B2b (migration 0005) `operators` была одна плоская таблица — 1:1 с users
внутри organization. Backlog B2b содержал пункты «operator transfer between
organizations» и «rehire workflow», которые показывали — реальный домен
холдинга НЕ single-org-per-operator.

Реальная модель заказчика (Jumix как холдинг):
- **Крановщик — человек платформы, а не компании.** Один человек может работать
  в одной дочке сегодня, в другой завтра; иногда — параллельно в двух.
- **Холдинг хочет централизованную базу крановщиков** (парк + кадры). Любой
  новый крановщик проходит approval холдингом ДО того как попадёт в список
  «доступных для найма» у дочек — ровно как cranes в ADR 0002.
- **Дочка нанимает крановщика** из approved-пула. Это вторая approval-линия:
  компания A заявляет «мы берём этого оператора», superadmin (или auto-rule
  позже) подтверждает. Инвариант «два актора» сохраняется: регистрация через
  мобилку создаёт pending crane_profile, найм создаёт pending
  organization_operator.
- **ИИН — идентичность человека на платформе, а не компании.** В текущей
  модели B2b (organization_id + iin UNIQUE среди живых) один и тот же ИИН мог
  появиться в нескольких orgs как отдельные записи — это дубликаты профиля,
  которые невозможно свести без ручной миграции.

Кроме того, ADR 0002 уже зафиксировал паттерн holding-approval для cranes.
Operators должны стать reference №2 этого паттерна, причём с новым измерением
— двумя независимыми approval pipelines (profile + membership).

## Решение

### Две таблицы вместо одной

**`crane_profiles`** — глобальная идентичность крановщика на платформе:

```
id (uuid, pk)
user_id (fk users, UNIQUE active)
first_name, last_name, patronymic
iin (UNIQUE active — глобально, не per-org)
avatar_key
specialization (jsonb — навыки человека, не привязаны к дочке)
approval_status (pending | approved | rejected) — admin gate для появления
                в пуле найма
approved_by_user_id, approved_at
rejected_by_user_id, rejected_at, rejection_reason
deleted_at
created_at, updated_at
```

ПДН (ФИО, ИИН, avatar) живут здесь. Это «карточка человека на платформе».
IIN глобальный UNIQUE — тот же ИИН не может появиться как два отдельных
профиля. Это защищает от двойной идентичности и упрощает merge-сценарии.

**`organization_operators`** — M:N membership между профилем и дочкой:

```
id (uuid, pk) — preserved from operators.id в backfill (audit-continuity)
crane_profile_id (fk crane_profiles)
organization_id (fk organizations)
hired_at, terminated_at — per-company employment dates
status (active | blocked | terminated) — operational employment state
availability (free | busy | on_shift | null) — shifts state
approval_status (pending | approved | rejected) — holding-gate для hire
approved_by_user_id, approved_at
rejected_by_user_id, rejected_at, rejection_reason
deleted_at
created_at, updated_at
UNIQUE (crane_profile_id, organization_id) WHERE deleted_at IS NULL
```

Это «факт работы профиля X в дочке Y». Отдельный approval_status — потому
что «человек одобрен платформой» не значит автоматически «одобрен в
конкретной дочке»: холдинг может подтверждать каждый найм (compliance,
квалификация под конкретную технику дочки).

### Два независимых approval-pipeline'а

Pipeline 1 — профиль человека (crane_profiles.approval_status):

```
registration (mobile, public SMS — B2d-3)
  → crane_profile.approval_status='pending'
    → superadmin approve → 'approved' → человек в пуле найма
    → superadmin reject → 'rejected' → read-only (delete для cleanup)
```

Pipeline 2 — найм в конкретную дочку (organization_operators.approval_status):

```
owner invites existing approved профиль (B2d-3)
  → organization_operator.approval_status='pending'
    → superadmin approve → 'approved' → operator работает в этой дочке
    → superadmin reject → 'rejected' → read-only
```

Оба pipeline'а следуют ADR 0002 паттерну (authorization.md §4.2b):
approve/reject — superadmin-only; rejected — read-only (delete OK); только
approved → operational lifecycle.

Инвариант «внешний актор обязателен» (holding-approval ADR 0002): owner не
может одобрять ни чужой профиль, ни собственный найм — это делает
суперадмин.

### Breaking change: operator JWT теряет `organizationId`

До B2d-1 operator JWT содержал `org: organization_id` — подразумевалось
«operator всегда в контексте одной org». После B2d-1 operator может
работать в N дочках параллельно, поэтому JWT не должен предписывать ни одну.

- **AuthContext (operator):** `{ role: 'operator', userId, tokenVersion }`
  — БЕЗ organizationId.
- **JWT:** `org: null` для role='operator'.
- **Per-org операции** (owner смотрит смены своего operator'а, operator
  отмечается на смену в конкретной стройке) — через header
  `X-Organization-Id`, который handler валидирует против активных
  organization_operator записей пользователя. Middleware добавит helper
  `requireOrgMembership(ctx, headerOrgId)`.
- **`/me` endpoints** — без org context (subject = userId всегда).

### Backfill при миграции 0007 (B2d-1)

Каждая запись в `operators` переносится 1→1:

1. Для каждой строки создаётся запись в `crane_profiles` с тем же user_id,
   перенос ПДН (ФИО, ИИН, avatar_key), specialization. `approval_status =
   'approved'` (существующие уже работали → implicit approval). `approved_at =
   operators.created_at`, `approved_by_user_id = NULL` (нет реального актора —
   помечаем как backfill в ADR).
2. Для той же строки создаётся `organization_operators` — preserved id
   (первичный ключ НЕ меняется, чтобы audit_log.targetId продолжал
   работать), crane_profile_id ссылается на созданный профиль,
   organization_id копируется, hired_at/terminated_at/status/availability
   переносятся. `approval_status = 'approved'`, `approved_at =
   operators.created_at`, `approved_by_user_id = NULL`.
3. `DROP TABLE operators` в конце миграции — полная замена.

IIN-collision риск: т.к. `operators.iin` был UNIQUE только per-org, теоретически
в двух разных orgs мог быть один и тот же ИИН (дубликат профиля). В B2b-dev
таких записей нет (1 дочка в тесте). При реальном deployment backfill script
должен сначала прогнать `SELECT iin, COUNT(DISTINCT user_id) FROM operators
WHERE deleted_at IS NULL GROUP BY iin HAVING COUNT(*) > 1` и merge'ить вручную.
Для MVP B2d-1 миграция полагается на отсутствие коллизий (0 дубликатов в тесте).

### Compat shim в B2d-1

Существующий `OperatorRepository` (и OperatorService / routes) остаются
API-совместимыми через JOIN между `organization_operators` +
`crane_profiles`. Hydrated `Operator` shape тот же, что был в B2b (id,
userId, organizationId, firstName, ..., status, availability, timestamps)
— service/handler не знают что под капотом теперь две таблицы.

`Operator.id` мапится на `organization_operators.id` (preserved через
backfill). `Operator.organizationId` — на `organization_operators.organization_id`.
Identity поля — на `crane_profiles.*` через JOIN.

`OperatorRepository.findByUserId` (self-scope) берёт «первый активный
organization_operator» для crane_profile этого user. В MVP одного оператора =
одна org, это работает. Когда появится multi-org (B2d-3), этот метод
deprecate'ится в пользу явного `findMembershipsByUserId` + `X-Organization-Id`
для per-org выбора.

### Прогресс split'а (B2d-2a → B2d-2b)

**B2d-2a** (предыдущий коммит) — выносит `crane-profile/` как отдельный модуль
и поднимает плагин `organization-context`:

- `apps/api/src/modules/crane-profile/` — platform-level CRUD
  (`/api/v1/crane-profiles`) + self-endpoints (`/me`, `/me/avatar/*`,
  `/me/memberships`) + approve/reject pipeline 1.
- `apps/api/src/plugins/organization-context.ts` — preHandler
  `app.requireOrganizationContext`: резолвит `X-Organization-Id` header для
  operator'а в активный `organization_operators` row, прикрепляет
  `request.organizationContext = { organizationOperator, craneProfile }`.
  Error matrix — см. [authorization.md §4.2c](../authorization.md#42c-multi-org-operator-model-adr-0003).

**B2d-2b** (текущий коммит) — переименование operator-модуля в
`organization-operator/` + approve/reject pipeline 2 + удаление compat-shim:

- `apps/api/src/modules/operator/` → `apps/api/src/modules/organization-operator/`.
  Классы: `OrganizationOperatorService` / `OrganizationOperatorRepository` /
  `organizationOperatorPolicy`. URL-префикс: `/api/v1/organization-operators`.
- **POST hire принимает ТОЛЬКО `{craneProfileId, hiredAt?}`**. Identity
  (phone/firstName/lastName/iin/specialization) больше не принимается —
  профиль должен уже существовать и быть approved (pipeline 1).
  Compat-shim `createUserAndOperator` удалён полностью.
- **Approval pipeline 2 активен**: POST создаёт pending
  organization_operator; superadmin апрувит через
  `POST /:id/approve` или отклоняет через `POST /:id/reject` с `reason`
  (superadmin-only, ADR 0002 holding-approval invariant).
- Rejected hire — read-only (delete разрешён для cleanup). Update/changeStatus
  pending hire → 409 `ORGANIZATION_OPERATOR_NOT_APPROVED`; rejected → 409
  `ORGANIZATION_OPERATOR_REJECTED_READONLY`. См. authorization.md §4.2b/§4.2c.
- **softDelete затрагивает ТОЛЬКО organization_operator**. crane_profile
  остаётся жить — тот же человек может быть перенанят сюда же (после
  освобождения UNIQUE-слота) или в другую дочку.
- **DTO отдаёт nested `craneProfile`** (id, userId, firstName, lastName,
  patronymic, iin, avatarUrl, approvalStatus) для list + detail —
  экономит N+1 запрос UI. Detail endpoint дополнительно возвращает
  `craneProfile.phone` (masked); в списке phone отсутствует.
- Audit action'ы: `organization_operator.submit` / `.approve` / `.reject` /
  `.update` / `.activate` / `.block` / `.terminate` / `.delete`.

**B2d-3** (текущий коммит) — public registration flow:

- `apps/api/src/modules/registration/` — `POST /api/v1/registration/{start,verify}`
  как тонкий orchestration-слой поверх `SmsAuthService` + `TokenIssuerService`.
  Migration 0008 ослабила `users_org_role_consistency_chk` чтобы разрешить
  `role='operator' + organization_id IS NULL` (identity-only user до hire).
  `authenticate.ts` скорректирован симметрично: org-status проверка теперь
  только для `role='owner'` (superadmin и operator вне primary org).
- `GET /api/v1/crane-profiles/me/status` — mobile screen routing:
  `{profile, memberships[], canWork}` где `canWork = profile.approved &&
  some(hire: approved+active)`. Анти-N+1 через JOIN на organizations.name.
- Подробности — ADR [0004](0004-public-registration-flow.md).

## Альтернативы которые рассматривали

### 1. Одна таблица `operators` с массивом org_ids (jsonb)

**Отвергнуто**: теряется ссылочная целостность, нельзя фильтровать
`WHERE organization_id = X` через индекс без GIN, approval-pipeline для
hire требует собственного rowid'а.

### 2. `operators` остаётся, но `organization_id` нулабельный + отдельная
таблица `operator_assignments` для M:N

**Отвергнуто**: двусмысленность «operator без org = холдинговый pool?
Или новый регистрирующийся? Или уволенный отовсюду?». Прямой split на
profile vs membership убирает двусмысленность.

### 3. Полный copy-on-hire: каждая дочка получает отдельный operator row

**Отвергнуто**: ломает идентичность (один человек = один IIN = один профиль).
Marketplace/rating в B4 требует единый subject для human, иначе рейтинги
фрагментированы.

### 4. Держать организацию в operator JWT, но разрешить multiple JWTs
пользователю (один на org)

**Отвергнуто**: refresh-rotation усложнится кратно, мобилка должна где-то
хранить current active org, UX непонятен. Стандартный подход: один JWT на
identity, per-request org context через header.

## Последствия

### Положительные

- Единая идентичность человека (одна запись crane_profiles на IIN).
- Multi-org естественно: создать M organization_operators, не копировать
  профиль.
- Два independent approval — платформенный gate + per-hire gate, каждый со
  своей audit-trail.
- Mobile public registration (B2d-3) становится простой: create pending
  crane_profile, ждём approve → попадание в пул.
- Rating/marketplace (B4) — rating привязывается к crane_profile, не к
  organization_operator, что корректно (рейтинг человека, не его эпизодической
  работы в конкретной дочке).
- operators backlog пункт «operator transfer between organizations» закрыт
  автоматически (теперь это просто new organization_operator, старый
  terminated — никакого copy-ID нет).

### Отрицательные

- B2d-1 — breaking change на JWT / AuthContext / API. Mobile app при
  обновлении должен re-login (старые operator JWT имеют org, новые — нет).
  Для B2b-dev это OK (mobile ещё не задеплоен).
- ~~Compat shim в OperatorRepository — временная сложность. Ликвидируется
  в B2d-2.~~ **Ликвидирован в B2d-2b** (этот commit).
- Per-org запросы operator'а требуют `X-Organization-Id` header. Middleware
  валидации на B2d-2.
- Возрастает количество миграций backfill'а если данные приедут от заказчика
  с дубликатами ИИН (см. раздел «Backfill»).

### Не решено (backlog)

- **Crane_profile merge** (два profile с одним человеком, которые появились
  при ручной регистрации в разных дочках до global UNIQUE — редкий edge
  case). Superadmin UI для ручного merge, перенос всех organization_operators
  на target profile. Backlog.
- **Auto-approval rules** для platform-level профилей (например, verified
  certificate from external registry → auto-approve). Не в MVP.
- **Multi-stage hire approval** (compliance → technical → final) — backlog,
  как и для cranes.
- **IIN ownership dispute** (два человека утверждают, что ИИН принадлежит
  им — после того как один зарегистрировался). Out of scope MVP.

## Референсные модули

- `apps/api/src/modules/crane/` — reference ADR 0002 паттерна (холдинг-approval).
- `docs/architecture/authorization.md §4.2b` — approval workflow pattern
  (будет расширен §4.2c для multi-org operator model в B2d-1).
- `CLAUDE.md §6 rule #11, #12` — critical rules для approval-gated +
  multi-org entities.
