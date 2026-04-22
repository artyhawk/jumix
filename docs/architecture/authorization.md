# Authorization — источник истины

> Extracted from CLAUDE.md §4. **Критически важная часть. Любой баг здесь = утечка данных между компаниями.**

## 4.1 Матрица прав

Полная матрица в отдельном документе [authorization-matrix.md](authorization-matrix.md) (создаётся по ходу MVP). Ключевые правила:

- **Superadmin** видит всё на уровне платформы, **НЕ видит финансов компаний** (п.4.1 ТЗ)
- **Owner** видит только свою организацию (scope через `organization_id`)
- **Operator** видит только свои данные (scope через `user_id`)
- **Marketplace** — единственное легальное место межтенантной видимости, с ограниченным DTO
- **Public endpoints** — `POST /api/v1/registration/start` и `POST /api/v1/registration/verify` (ADR [0004](adr/0004-public-registration-flow.md)) намеренно идут БЕЗ `app.authenticate`: это точка входа для крановщика, у которого ещё нет аккаунта. Verify создаёт users-запись с `role='operator'`, `organization_id=null` и crane_profiles с `approval_status='pending'`. Аккаунт не даёт никаких per-org привилегий до одобрения superadmin'ом + найма (`organization_operators`).

## 4.2 Four-layer defense

**Layer 1: JWT claims + middleware**

```typescript
// В каждом access token:
{
  sub: user_id,
  org: organization_id | null,  // null только для superadmin
  role: 'superadmin' | 'owner' | 'operator',
  iat, exp, jti
}
```

Middleware раскладывает в `request.ctx: AuthContext`.

**Layer 2: Policy functions (чистые функции)**

```typescript
// modules/operator/operator.policy.ts
export const operatorPolicy = {
  canRead: (ctx: AuthContext, op: Operator): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner' && op.organizationId === ctx.organizationId) return true
    if (ctx.role === 'operator' && op.userId === ctx.userId) return true
    return false
  },
  listScope: (ctx: AuthContext): ListScope => {
    if (ctx.role === 'superadmin') return { type: 'all' }
    if (ctx.role === 'owner') return { type: 'by_org', orgId: ctx.organizationId! }
    throw new ForbiddenError()
  },
  // ... canCreate, canUpdate, canApprove, canDelete
}
```

Policies — **чистые функции** над `AuthContext` + минимальным `Pick<Entity, ...>`. Никаких БД-запросов, никаких сайд-эффектов; это делает их легко unit-тестируемыми матрицей «роль × область».

## 4.2a Self-scope predicates (`canReadSelf` / `canUpdateSelf`)

Для self-service endpoints (`/me`, `/me/avatar/*`) policy выделяет отдельные предикаты. Их контракт отличается от admin-предикатов:

- **Subject identification — ТОЛЬКО `ctx.userId`.** Никогда — `request.params.id`, `request.body.userId` и т.п. Это не стилистическое правило, а защита от cross-tenant CSRF-подобных атак: оператор не должен иметь возможности указать «чей» профиль он редактирует даже через ошибку программиста (см. CLAUDE.md §6 rule #10).
- **`canReadSelf` работает для ВСЕХ статусов** (`active` / `blocked` / `terminated`). Обоснование — ПДЛ РК и ст. 23 Закона «О персональных данных»: субъект имеет право на доступ к своим ПДН вне зависимости от блокировки/увольнения. Скрывать собственные данные от субъекта — нельзя.
- **`canUpdateSelf` требует `status='active'`.** Заблокированный или уволенный оператор не может «обновить своё ФИО» — его учётная запись заморожена. Единственный путь разморозки — admin меняет статус.
- **`deleted_at IS NOT NULL` = полная заморозка.** Soft-deleted записи не доступны даже через `canReadSelf` (repository уровень отсекает их независимо от policy).
- **Owner/superadmin не могут использовать `canReadSelf` / `canUpdateSelf`.** Для них есть admin-предикаты с проверкой `organizationId`. Это гарантирует что handler-у `/me` нельзя «подсунуть» admin-токен.

**Типичная ошибка:** принимать `operatorId` в `/me`-endpoint «для гибкости». Это открывает cross-tenant vulnerability — хотя policy вернёт false, сам факт наличия параметра в контракте приглашает к злоупотреблениям. Правильно: `/me`-endpoints НЕ имеют path/body параметров для идентификации субъекта, subject берётся только из `ctx.userId`.

## 4.2b Approval workflow pattern (holding-approval)

Для сущностей, которые создаёт `owner`, но допускать к operational обороту должен `superadmin` (холдинг), в модуле появляется **второе измерение статуса** — `approval_status`, ортогональное operational `status`.

**Базовая модель** (reference implementation — cranes, ADR [0002](adr/0002-holding-approval-model.md)):

```
approval_status: 'pending' | 'approved' | 'rejected'    ← admin-gated
status:          'active' | 'maintenance' | 'retired'   ← operational
```

Оси независимые: `approval_status` меняется только через отдельные endpoints (approve/reject), а `status` — через operational action'ы (activate/maintenance/retire). Mutations operational `status` gated: требуется `approval_status='approved'`.

**Правила применимости:**

- `POST /entities` (owner) → entity создаётся как `approval_status='pending'`; audit action `entity.submit`
- `POST /entities/:id/approve` → **superadmin only**; pending → approved; `approved_by_user_id` + `approved_at`; audit `entity.approve`
- `POST /entities/:id/reject` → **superadmin only**; body `{reason}` обязателен; pending → rejected; `rejected_by_user_id` + `rejected_at` + `rejection_reason`; audit `entity.reject`
- `canApprove` / `canReject` — **только `role === 'superadmin'`**. Owner НЕ может одобрять собственные заявки (ключевой инвариант: внешний актор всегда обязателен)
- Approve/reject не-pending заявки → **409 `ENTITY_NOT_PENDING`** (не меняем approved/rejected — один переход за жизнь)
- `canUpdate` возвращает `false` для `rejected` (read-only после отказа) — **единственный путь модификации rejected-записи — delete**. Это защита «договорного» характера: отказ зафиксирован, owner не должен иметь возможности «подправить» и передать снова без явного ре-submit'а
- `canChangeStatus` требует `approval_status === 'approved'`. Pending → **409 `ENTITY_NOT_APPROVED`**, rejected → **409 `ENTITY_REJECTED_READONLY`**
- `canDelete` разрешён во всех approval-state'ах (cleanup должен работать для всех)

**List-фильтр:** `GET /entities?approvalStatus=pending|approved|rejected|all` (default — `'approved'`). Это значит, что по умолчанию owner'ский operational список не шумит pending/rejected записями — их видно только по явному запросу (approval queue UX). Superadmin с `?approvalStatus=pending` получает глобальную очередь заявок.

**DTO boundary:** `approved_at` / `rejected_at` / `rejection_reason` отдаются клиенту (owner видит, почему отказали). `approved_by_user_id` / `rejected_by_user_id` — **internal audit**, не в публичном DTO (они живут в `audit_log`).

**Индексы:** partial index для hot-path очереди `WHERE approval_status = 'pending' AND deleted_at IS NULL`; существующие operational индексы (например «какие краны на site'е») дополняются условием `approval_status = 'approved'`, чтобы в индексе не сидели pending/rejected записи.

**Reference implementations:**

- `apps/api/src/modules/crane/` (ADR 0002) — прямое применение паттерна для кранов.
- `apps/api/src/modules/crane-profile/` (ADR 0003 pipeline 1) — платформенный approval identity.
- `apps/api/src/modules/organization-operator/` (ADR 0003 pipeline 2) — per-org hire approval. Коды ошибок: `ORGANIZATION_OPERATOR_NOT_PENDING` / `ORGANIZATION_OPERATOR_NOT_APPROVED` / `ORGANIZATION_OPERATOR_REJECTED_READONLY` (специализация `ENTITY_*` из таблицы выше).

## 4.2c Multi-org operator model (ADR 0003)

Один человек-крановщик может работать в нескольких дочках холдинга. Для этого identity + membership разделены на две таблицы — **holding-approval в two-pipeline форме** (ADR [0003](adr/0003-operators-multi-org-model.md)):

- **`crane_profiles`** — платформенная личность: ФИО, **ИИН глобально уникален** среди живых, аватар, навыки. Свой `approval_status` (pipeline 1 — платформа пускает человека в пул найма).
- **`organization_operators`** — M:N membership `(crane_profile_id, organization_id)`: «этот человек работает в этой дочке». Свой `approval_status` (pipeline 2 — холдинг одобряет конкретный найм). Сюда же переезжают operational поля: `hired_at`, `terminated_at`, `status` (active/blocked/terminated), `availability`.

Оба pipeline'а подчиняются § 4.2b (superadmin-only approve/reject, rejected read-only, operational gate на approved).

**JWT-контракт для operator (BREAKING vs B2b):**

- `org` claim в access-токене operator'а — **всегда `null`**. Operator не привязан к одной дочке на уровне идентичности. Zod-схема `accessTokenClaimsSchema` и БД CHECK это инвариантят.
- `AuthContext` для role=operator: `{ role: 'operator', userId, tokenVersion }` — **без** `organizationId`. Owner/superadmin по-прежнему несут `organizationId` / `null`.
- Per-org операции operator'а (выбор конкретной дочки, смен, баланса) идут через `X-Organization-Id` header. Plugin `organization-context` (B2d-2a) декорирует `app.requireOrganizationContext`: preHandler резолвит header в `organization_operators.id` для crane_profile текущего `ctx.userId` и проверяет `approval_status='approved' AND status<>'terminated' AND deleted_at IS NULL AND crane_profiles.deleted_at IS NULL`. Error matrix: без header'а → 400 `ORGANIZATION_HEADER_REQUIRED`; header не UUID → 400 `ORGANIZATION_HEADER_INVALID`; role≠operator → 403 `ORGANIZATION_CONTEXT_OPERATOR_ONLY`; нет активного найма → 403 `ORGANIZATION_MEMBERSHIP_NOT_FOUND`. На успехе вешает `request.organizationContext = { organizationOperator, craneProfile }`.
- `sameOrganization(ctx, orgId)` для operator'а теперь **всегда `false`** (нет «той же» org без выбора). `tenantListScope` для operator → `{ type: 'by_crane_profile', userId }`.

**B2d-2a splits:** self-endpoints (`/me`, `/me/avatar/*`) + platform admin (list/get/update/delete/approve/reject crane-profile) переехали в отдельный модуль `apps/api/src/modules/crane-profile/` с маршрутами `/api/v1/crane-profiles/*` (pipeline 1).

**B2d-2b complete (текущий коммит):** operator-модуль переименован в `organization-operator/`, маршруты — `/api/v1/organization-operators/*`. Admin-surface: POST/GET/PATCH/DELETE `/:id` + PATCH `/:id/status` + **POST `/:id/approve` + POST `/:id/reject`** (pipeline 2, superadmin-only). POST hire принимает только `{craneProfileId, hiredAt?}` — identity должна уже существовать и быть approved на уровне платформы; создаётся pending `organization_operator`. `softDelete` затрагивает только hire-запись (identity на crane_profile сохраняется — тот же человек может быть перенанят в эту же или другую дочку). Compat-shim `createUserAndOperator` удалён, hydrated shape теперь `{ hire: OrganizationOperator, profile: CraneProfile }`, DTO отдаёт `craneProfile` nested'ом (id, userId, firstName, lastName, patronymic, iin, avatarUrl, approvalStatus) для list + detail; phone (masked) — только в detail endpoint.

## 4.2d License document flow (ADR 0005)

Удостоверение крановщика — третий gate в `canWork` (plus profile approved + ≥1 approved+active hire). Подробности механики — ADR [0005](adr/0005-license-document-flow.md) и CLAUDE.md §6 rule #15; ниже только authz-измерение.

**Authz-matrix license endpoints (`/api/v1/crane-profiles/*`):**

| Endpoint | operator (self) | owner | superadmin |
|---|---|---|---|
| `POST /me/license/upload-url` | ✓ (approved only; 409 иначе) | — | — |
| `POST /me/license/confirm` | ✓ (approved only) | — | — |
| `POST /:id/license/upload-url` | — | 404 (вне scope) | ✓ (любой status — override) |
| `POST /:id/license/confirm` | — | 404 | ✓ |

**Self-path инвариант:** subject — ТОЛЬКО `ctx.userId` (CLAUDE.md rule #10). Никакого `operatorId` / `profileId` в URL/query/body для `/me/*`.

**Profile approval-gate на self-path:** upload/confirm **требует** `profile.approvalStatus === 'approved'`. Pending/rejected профили получают 409 `CRANE_PROFILE_NOT_APPROVED`. Мотивация: пока identity не подтверждена платформой, принимать документ преждевременно — rejected-профиль в итоге вообще не должен существовать в работе. Admin override (`/:id/license/*`) игнорирует approval-state: ТЗ допускает superadmin'у дозагрузить документ для pending-профиля при ручном onboarding.

**Prefix check на confirm** — часть authz-слоя: `key` в payload ДОЛЖЕН начинаться с `crane-profiles/{subject-profile-id}/license/v{licenseVersion+1}/`. Защищает от cross-profile injection (оператор A подсовывает ключ оператора B в confirm; presign выдаётся per-profile, но без prefix-check на confirm ключ можно было бы переподменить). 400 `LICENSE_KEY_MISMATCH` иначе.

**Audit distinctness.** Self-path пишет `license.upload_self`, admin-path — `license.upload_admin`. Cron-worker — `license.warning_sent` actor=system (userId=null, actorRole='system'). Это даёт compliance-трейл: кто именно загрузил (сам оператор vs админ-override), и что cron отработал в положенное время.

**licenseUrl в DTO** — presigned GET URL, expires 15 минут. Генерируется на boundary при каждом GET profile. Не кешируется на клиенте как постоянная ссылка.

**Layer 3: Repository с обязательным AuthContext**

```typescript
export class OperatorRepository {
  constructor(private db: Database, private ctx: AuthContext) {}

  async findMany(filters: OperatorFilters): Promise<Operator[]> {
    const scope = operatorPolicy.listScope(this.ctx)
    const query = this.db.select().from(operators)
    if (scope.type === 'by_org') {
      query.where(eq(operators.organizationId, scope.orgId))
    }
    return query.where(/* filters */)
  }
}
```

**Правило: никаких "голых" db-запросов из handlers или services.** Только через repository.

**Layer 4: PostgreSQL RLS (опционально, после MVP)**

Row-Level Security как последняя страховка. Настраиваем после стабилизации, не в MVP.

## 4.3 Критичные правила

- **404 вместо 403** для скрытия существования ресурсов (чужая организация, чужой operator)
- **DTO для marketplace** — отдельный тип с усечёнными полями (без контактов)
- **Все чувствительные действия → audit_log** (см. [business-logic.md](business-logic.md) §7.5)
- **Тесты обязательны** на каждый endpoint:
  - Happy path разрешённой роли
  - Запрещённая роль той же организации
  - Запрещённая роль чужой организации
  - Неавторизованный запрос
