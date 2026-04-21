# CLAUDE.md — Jumix Platform

> Единый контекстный документ для Claude Code. Читается при каждой сессии.
> Версия: 1.0 | Дата: апрель 2026 | Проект: Jumix (платформа управления крановщиками)

---

## 0. Как Claude Code должен работать с этим документом

**Читать целиком перед любой задачей.** Этот документ — источник истины по архитектуре, конвенциям и бизнес-логике. Решения здесь уже приняты после детального обсуждения с владельцем проекта (Yerbol).

**Если задача противоречит этому документу** — сначала спросить, не обновлять CLAUDE.md молча.

**Если задача не покрыта этим документом** — применить принципы из раздела 12 (Decision Framework) и предложить решение, не делать молча.

**Приоритет источников:**
1. Явная инструкция пользователя в текущем сообщении
2. CLAUDE.md (этот файл)
3. Документы заказчика: `/docs/contract/ТЕХНИЧЕСКОЕ_ЗАДАНИЕ.docx`, `/docs/contract/Договор.docx`
4. Общие best practices

---

## 1. О проекте

### 1.1 Что такое Jumix

SaaS-платформа для компаний, которые сдают в аренду башенные краны и предоставляют крановщиков на строительные объекты в Казахстане.

**Компоненты:**
- **Веб-портал** (Next.js) — админка для суперадминов, владельцев компаний, и ограниченный кабинет крановщиков
- **Мобильное приложение** (React Native + Expo) — для крановщиков: смены, геолокация, СИЗ, рейтинги
- **Backend API** (Node.js + Fastify) — единый REST API для обоих клиентов
- **Worker** — фоновые задачи (SMS, push, cron, отчёты)

### 1.2 Заказчик и контекст

- **Заказчик:** ТОО «Telse», Шымкент
- **Исполнитель:** ИП «Yerbol»
- **Договор:** №T35.5/26 от 17 апреля 2026
- **Бюджет:** 1 800 000 ₸ без НДС (72% предоплата, 28% по акту)
- **Срок:** 5 месяцев с момента первого платежа
- **Интеллектуальная собственность:** полностью передаётся заказчику по завершении
- **Гарантия:** 60 дней после подписания финального акта

### 1.3 Цели MVP

Минимально жизнеспособный продукт со следующими возможностями:
- Мультитенантный учёт организаций-арендодателей кранов
- Управление объектами, кранами, крановщиками, назначениями
- Фиксация смен через мобильное приложение с GPS-верификацией
- Автоматический расчёт заработной платы (движок начислений)
- Биржа свободных крановщиков между компаниями
- Контроль сроков удостоверений и обязательного подтверждения СИЗ
- Система рейтингов крановщиков и организаций
- Push-уведомления и центр уведомлений

**НЕ в MVP** (на пост-MVP, требует допсоглашения):
- Интеграции с 1С / бухгалтерскими системами
- Платёжные системы
- Аналитика с ML / прогнозы
- Web-чат между крановщиками и владельцами
- Интеграция с камерами / IoT на объектах
- Мультивалютность (пока только ₸)

### 1.4 Роли пользователей

Три роли с чёткой иерархией видимости (см. раздел 4 — Authorization):

| Роль | Где работает | Что видит |
|---|---|---|
| **Superadmin** | Веб | Все организации платформы, **без доступа к финансам компаний** |
| **Owner** (владелец компании) | Веб | Только свою организацию: объекты, краны, крановщики, смены, финансы |
| **Operator** (крановщик) | Мобилка (основной) + веб (ограниченный) | Только свои данные: профиль, смены, баланс |

---

## 2. Технологический стек

### 2.1 Backend

| Компонент | Выбор | Версия | Почему |
|---|---|---|---|
| Runtime | **Node.js** | 22 LTS | Экосистема, опыт команды |
| Язык | **TypeScript** | 5.x | strict mode обязателен |
| HTTP framework | **Fastify** | 5.x | Быстрее Express, встроенные JSON Schema, type-safe |
| Валидация | **Zod** | 3.x | Compile-time + runtime type safety |
| ORM | **Drizzle ORM** | latest | Type-safe SQL без рантайм-магии Prisma, легче читать генерируемые запросы |
| БД | **PostgreSQL** | 16 | ACID, PostGIS, RLS, JSONB |
| Геоданные | **PostGIS** | 3.4 | Геозоны, расчёт расстояний |
| Cache/queue | **Redis** | 7.x | Rate limit, cache, BullMQ backend |
| Job queue | **BullMQ** | 5.x | Отложенные задачи, cron, retry, DLQ |
| Файлы | **MinIO** (S3-совместимо) | latest | Удостоверения, фото СИЗ, фото неисправностей |
| Auth | `@fastify/jwt`, `argon2`, `@fastify/cookie` | — | См. раздел 5 |

### 2.2 Frontend (веб)

| Компонент | Выбор | Почему |
|---|---|---|
| Framework | **Next.js 15** (App Router) | SSR, RSC для dashboards, Server Actions для форм |
| UI kit | **shadcn/ui** + custom компоненты | Полный контроль над стилями, без vendor lock |
| Styling | **Tailwind CSS v4** | Стандарт, хорошо работает с shadcn |
| State (client) | **Zustand** (локальный) + **TanStack Query** (server state) | Минимум boilerplate |
| Forms | **React Hook Form** + **Zod resolver** | Тот же Zod что на бэке |
| Tables | **TanStack Table** | Сложные таблицы с фильтрами, сортировкой |
| Maps | **MapLibre GL JS** + **Protomaps** | Open source, полный контроль стилей |
| i18n | **next-intl** | RU / KZ |
| API client | **openapi-fetch** + **openapi-typescript** | Автогенерация типов из OpenAPI |
| Icons | **Lucide** + **Tabler Icons** (домен-специфика) | Одинаковый stroke, кириллица-friendly |

### 2.3 Mobile

| Компонент | Выбор | Почему |
|---|---|---|
| Framework | **React Native** + **Expo SDK 52+** | Опыт команды, fast iteration |
| Navigation | **Expo Router** | File-based routing, deep linking |
| State | **Zustand** + **TanStack Query** | Консистентность с вебом |
| Secure storage | **expo-secure-store** | Keychain / EncryptedSharedPreferences |
| Biometric | **expo-local-authentication** | Re-auth для чувствительных действий |
| Location | **expo-location** | GPS с фоновым режимом |
| Push | **expo-notifications** → FCM | Android + iOS |
| Maps | **react-native-maps** (Yandex/2GIS tiles) | Familiar для локального пользователя |
| i18n | **i18n-js** или **expo-localization** | RU / KZ |

### 2.4 DevOps / Infrastructure

| Компонент | Выбор |
|---|---|
| Контейнеризация | **Docker** + **docker-compose** |
| Reverse proxy | **Nginx** + **Let's Encrypt** |
| Hosting | **Hetzner** (MVP) или **Cloud.kz / PS Cloud** при требовании data residency |
| CI/CD | **GitHub Actions** |
| Registry | **GitHub Container Registry** (GHCR) |
| Monitoring | **Uptime Kuma** (MVP) → Prometheus + Grafana (post-MVP) |
| Logs | json-file driver + ротация (MVP) → Loki (post-MVP) |
| Backup storage | S3-совместимое (Cloud.kz / Hetzner Storage Box) |

### 2.5 Testing

| Layer | Инструмент |
|---|---|
| Unit | **Vitest** |
| Integration (API) | **Vitest** + **Testcontainers** (PostgreSQL) + **fastify.inject()** |
| E2E (веб, minimal) | **Playwright** (2-3 критичных сценария) |
| Component tests | **React Testing Library** (только 3-5 сложных компонентов) |
| Mobile | Ручное через TestFlight / Internal Testing на старте |
| Coverage | **Vitest coverage** + **Codecov** (free) |

### 2.6 Code quality

| Что | Чем |
|---|---|
| Linting + formatting | **Biome** (замена ESLint + Prettier, быстрее в разы) |
| Sonar-правила | **eslint-plugin-sonarjs** как дополнение (если Biome не покрывает) |
| Secrets scanning | **gitleaks** в pre-commit hook |
| Pre-commit hooks | **lefthook** (быстрее husky) |
| Dependencies | **Dependabot** (GitHub) |
| AI code review | **CodeRabbit Pro** с `.coderabbit.yaml` под проект |
| Type check в CI | `tsc --noEmit` |

---

## 3. Архитектура проекта

### 3.1 Монорепа

Используем **pnpm workspaces** (не Turborepo на старте — избыточно).

```
jumix/
├── apps/
│   ├── api/              # Fastify backend
│   ├── worker/           # BullMQ job processor (отдельный workspace, см. §3.4)
│   ├── web/              # Next.js admin панель
│   └── mobile/           # React Native + Expo
├── packages/
│   ├── db/               # Drizzle schema, миграции, seed
│   ├── shared/           # Общие типы, Zod схемы, константы
│   ├── auth/             # Auth core (токены, policy, RBAC)
│   ├── api-types/        # Автогенерированные OpenAPI типы
│   └── config/           # Общие конфиги (tsconfig, biome, и т.д.)
├── infra/
│   ├── docker/           # Dockerfile'ы, compose файлы
│   ├── nginx/            # Nginx конфиги
│   └── scripts/          # Deploy, backup, restore скрипты
├── docs/
│   ├── contract/         # ТЗ и договор (readonly reference)
│   ├── architecture/     # ADR, диаграммы
│   └── runbooks/         # Что делать при падении БД / деплое / etc
├── .github/
│   └── workflows/        # CI/CD
├── CLAUDE.md             # Этот файл
├── README.md
├── package.json          # pnpm workspace root
├── pnpm-workspace.yaml
├── .coderabbit.yaml
├── lefthook.yml
├── biome.json
└── (assets брендинга живут в apps/web/public/brand/, см. §8.8)
```

### 3.2 API — слоистая архитектура

Никакого «DDD с CQRS на старте». Простая, проверенная схема:

```
HTTP Request
    ↓
┌───────────────────────────────────┐
│ Route (fastify plugin)            │  только регистрация маршрута
└─────────────┬─────────────────────┘
              ↓
┌───────────────────────────────────┐
│ Middleware: auth → context        │  JWT → ctx { userId, orgId, role }
└─────────────┬─────────────────────┘
              ↓
┌───────────────────────────────────┐
│ Handler (controller)              │  валидация Zod, вызов service
└─────────────┬─────────────────────┘
              ↓
┌───────────────────────────────────┐
│ Policy check                      │  operatorPolicy.canRead(ctx, target)
└─────────────┬─────────────────────┘
              ↓
┌───────────────────────────────────┐
│ Service (business logic)          │  оркестрация, транзакции
└─────────────┬─────────────────────┘
              ↓
┌───────────────────────────────────┐
│ Repository (data access)          │  Drizzle queries с tenant scope
└─────────────┬─────────────────────┘
              ↓
          PostgreSQL
```

**Правила:**
- Handler **не обращается** к БД напрямую, только через service
- Service **не обращается** к БД напрямую, только через repository
- Repository **требует AuthContext** в конструкторе (tenant scope автоматически)
- Policy — **чистые функции**, легко тестируются

### 3.3 Структура `apps/api`

```
apps/api/
├── src/
│   ├── server.ts               # Fastify entry point
│   ├── config/                 # env vars, константы
│   ├── plugins/                # Fastify плагины (auth, cors, rate-limit, ...)
│   ├── modules/                # По одному на ресурс
│   │   ├── organization/
│   │   │   ├── organization.routes.ts
│   │   │   ├── organization.handlers.ts
│   │   │   ├── organization.service.ts
│   │   │   ├── organization.repository.ts
│   │   │   ├── organization.policy.ts
│   │   │   ├── organization.schemas.ts   # Zod
│   │   │   └── organization.test.ts
│   │   ├── operator/
│   │   ├── site/
│   │   ├── crane/
│   │   ├── shift/
│   │   ├── payroll/
│   │   ├── rating/
│   │   ├── marketplace/
│   │   ├── malfunction/
│   │   ├── notification/
│   │   ├── auth/
│   │   └── document/
│   ├── integrations/           # Внешние сервисы (клиенты)
│   │   ├── mobizon/
│   │   ├── fcm/
│   │   └── s3/
│   ├── middleware/             # Auth, tenant, audit
│   └── lib/                    # Утилиты (геозона, валидация телефона KZ)
└── tests/
    └── helpers/                # Test fixtures, factories
```

### 3.4 Структура `apps/worker`

Worker — **отдельный pnpm workspace** с собственной точкой входа. Это даёт:
- раздельный lifecycle: worker падает/масштабируется независимо от API
- разные переменные окружения (воркер не слушает HTTP)
- чистое разделение ответственности в монорепе (handlers ≠ jobs)

```
apps/worker/
├── src/
│   ├── worker.ts               # BullMQ entry (регистрирует всех processors)
│   ├── processors/             # Обработчики очередей
│   │   ├── sms.processor.ts
│   │   ├── push.processor.ts
│   │   ├── payroll-calc.processor.ts
│   │   └── document-expiry.processor.ts
│   ├── crons/                  # Повторяющиеся задачи
│   │   ├── document-expiry.cron.ts
│   │   └── weather-notify.cron.ts
│   └── config/
└── tests/
```

**Бизнес-логика** (что делает процессор внутри) живёт в соответствующих сервисах `apps/api/src/modules/*` и переиспользуется оттуда. Процессор — тонкий слой: валидация job payload, вызов сервиса, обработка retry/DLQ.

**Shared контракты jobs** (типы payload, имена очередей) — в `packages/shared/src/jobs/` чтобы продьюсер (API) и консьюмер (worker) использовали один источник истины.

**Деплой:** один Docker-образ (монорепа билдится целиком), разные команды запуска:
```
api:    CMD ["node", "apps/api/dist/server.js"]
worker: CMD ["node", "apps/worker/dist/worker.js"]
```

---

## 4. Authorization — источник истины

**Критически важная часть. Любой баг здесь = утечка данных между компаниями.**

### 4.1 Матрица прав

Полная матрица в отдельном документе `docs/architecture/authorization-matrix.md`. Ключевые правила:

- **Superadmin** видит всё на уровне платформы, **НЕ видит финансов компаний** (п.4.1 ТЗ)
- **Owner** видит только свою организацию (scope через `organization_id`)
- **Operator** видит только свои данные (scope через `user_id`)
- **Marketplace** — единственное легальное место межтенантной видимости, с ограниченным DTO

### 4.2 Four-layer defense

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

### 4.3 Критичные правила

- **404 вместо 403** для скрытия существования ресурсов (чужая организация, чужой operator)
- **DTO для marketplace** — отдельный тип с усечёнными полями (без контактов)
- **Все чувствительные действия → audit_log** (см. раздел 7.4)
- **Тесты обязательны** на каждый endpoint:
  - Happy path разрешённой роли
  - Запрещённая роль той же организации
  - Запрещённая роль чужой организации
  - Неавторизованный запрос

---

## 5. Authentication

### 5.1 Токены

**Access token:** JWT RS256, TTL 15 минут
**Refresh token:** opaque (случайные 64 байта base64url), TTL 30 дней (веб) / 90 дней (мобилка), хэшируется SHA-256, хранится в БД.

**Refresh token rotation:**
- При каждом use → старый revoked, replaced_by=new_id
- При reuse revoked токена → отозвать всю цепочку + alert

### 5.2 Хранение токенов

**Веб:**
- Access: httpOnly, Secure, SameSite=Lax cookie
- Refresh: httpOnly, Secure, SameSite=Strict, path=/api/auth/refresh
- CSRF: double-submit pattern

**Мобилка:**
- Access: в памяти (Zustand), не пишется на диск
- Refresh: `expo-secure-store` с `requireAuthentication: true` (biometric guard)

### 5.3 Логин

**Два способа:**
1. SMS-код через Mobizon (phone → 6-digit code → verify)
2. Phone + password (argon2id, min 10 chars, zxcvbn check)

**Rate limiting (обязательно):**
- SMS: 1 запрос/60 сек/phone, 5/час/phone, 20/час/IP
- Password: после 5 неудач — экспоненциальный backoff, после 10 — lock 15 мин
- Капча (Cloudflare Turnstile) после превышения лимитов

### 5.4 Схема БД auth

```sql
-- users (базовая)
users { id, phone, password_hash, role, organization_id, token_version, ... }

-- refresh_tokens (с ротацией)
refresh_tokens {
  id, user_id, token_hash (SHA-256),
  device_id, ip_address, user_agent,
  created_at, last_used_at, expires_at,
  revoked_at, revoked_reason, replaced_by
}

-- auth_events (audit)
auth_events {
  id, user_id, event_type, phone, ip, user_agent,
  success, failure_reason, metadata, created_at
}

-- password_reset_tokens
password_reset_tokens { id, user_id, token_hash, expires_at, used_at }
```

### 5.5 Logout

- `POST /auth/logout` — revoke текущего refresh
- `POST /auth/logout-all` — revoke всех refresh + инкремент `users.token_version` (отклоняет старые access)

---

## 6. Database schema (основные сущности)

### 6.1 Организации и пользователи

```
organizations { id, name, bin, status, contact_name, contact_phone, ... }
users { id, phone, password_hash, role, organization_id (nullable for superadmin), name, ... }
```

### 6.2 Операторы (крановщики)

```
operators {
  id, user_id, organization_id,
  first_name, last_name, middle_name, quialification,
  status ('active' | 'pending' | 'rejected' | 'blocked'),
  availability_status ('free' | 'busy' | 'on_shift'),
  marketplace_opt_in boolean,
  rating_avg, shifts_count,
  ...
}

operator_documents {
  id, operator_id, doc_type,
  file_url, expires_at,
  status (computed: 'valid' | 'expiring' | 'expired'),
  uploaded_at
}

operator_payment_terms {
  id, operator_id,
  day_rate, night_rate, overtime_rate, fixed_rate,
  effective_from, effective_to
}
```

### 6.3 Объекты и краны

```
sites {
  id, organization_id, name, address,
  geofence_center (PostGIS POINT), geofence_radius_m (default 150),
  status ('published' | 'completed' | 'archived'),
  ...
}

cranes {
  id, organization_id, type, model, capacity_ton, boom_length_m,
  year, inventory_number, tariffs_json, ...
}

assignments {
  id, operator_id, crane_id, site_id,
  assignment_type ('primary' | 'shift' | 'replacement'),
  date_from, date_to (nullable), is_active,
  ...
}
```

### 6.4 Смены

```
shifts {
  id, operator_id, crane_id, site_id, organization_id,
  started_at, ended_at,
  start_lat, start_lng, end_lat, end_lng,
  is_on_site_start, is_on_site_end,  -- геозона check
  ppe_confirmed boolean, ppe_photo_url,
  calculated_hours, shift_type ('day' | 'night' | 'mixed'),
  ...
}
```

### 6.5 Финансы

```
timesheets { id, organization_id, period_from, period_to, status, ... }
timesheet_entries { id, timesheet_id, operator_id, shift_id, hours, type, ... }

payroll_rules {
  id, organization_id,
  rules_json (structured spec, задаётся специалистом заказчика),
  version, effective_from, created_by
}

payroll_calculations {
  id, timesheet_id, operator_id,
  base_amount, overtime_amount, bonus_amount, deductions,
  total_amount, breakdown_json,
  status ('draft' | 'approved' | 'paid'),
  calculated_at, approved_by, approved_at
}
```

### 6.6 Прочее

```
malfunction_reports { id, shift_id, operator_id, description, photo_url, status, ... }
ratings_operator { id, operator_id, rated_by_user_id, score, criteria_json, comment, ... }
ratings_organization { id, organization_id, rated_by_user_id, score, ... }
notifications { id, user_id, type, title, body, read_at, created_at }
contact_requests { id, from_user_id, to_operator_id, status, created_at, responded_at }

audit_log {
  id, actor_user_id, actor_role, action, target_type, target_id,
  organization_id, metadata_json, ip_address, created_at
}
```

### 6.7 Индексы

Критичные индексы:
- `operators(organization_id, status)` — частые фильтры в списках
- `shifts(organization_id, started_at DESC)` — история смен
- `shifts(operator_id, started_at DESC)` — смены оператора
- `audit_log(organization_id, created_at DESC)` — аудит по компании
- `refresh_tokens(user_id) WHERE revoked_at IS NULL`
- `refresh_tokens(token_hash) WHERE revoked_at IS NULL`
- `operators` GIN-индекс для полнотекстового поиска по ФИО
- GIST-индекс на `sites.geofence_center` для spatial queries

---

## 7. Business logic — ключевые алгоритмы

### 7.1 Геозона и проверка присутствия

```typescript
function isInsideGeofence(
  pointLat: number, pointLng: number,
  centerLat: number, centerLng: number,
  radiusM: number
): boolean {
  const distance = haversine(pointLat, pointLng, centerLat, centerLng)
  return distance <= radiusM
}
```

**Правила:**
- Дефолтный радиус 150 м (из ТЗ), настраивается владельцем
- При старте смены — фиксируется координата + флаг `is_on_site_start`
- При завершении — аналогично `is_on_site_end`
- Вне зоны **не блокирует** смену, но помечает в UI (не задача МVP — блокировать)
- **Unit-тесты обязательны:** точка в центре, на границе, снаружи, edge cases с координатами

### 7.2 State machine статусов оператора

```
         ┌──────────────┐
         │   Свободен   │ ←─────────┐
         └──────┬───────┘           │
                │ assignment        │ unassign
                ↓                   │
         ┌──────────────┐           │
         │    Занят     │ ──────────┘
         └──┬───────▲───┘
            │       │
 start shift│       │ end shift
            ↓       │
         ┌──────────┴───┐
         │  На смене    │
         └──────────────┘
```

Transitions реализуются как чистая функция, покрывается тестами.

Владелец может вручную переопределить статус (из ТЗ).

### 7.3 Статус удостоверения (cron)

Каждый день в 02:00 (в timezone Asia/Almaty) job пересчитывает статусы:
- Если `expires_at` в прошлом → `expired`
- Если до `expires_at` ≤ 7 дней → `critical_warning` + push + notification
- Если до `expires_at` ≤ 30 дней → `warning` + notification
- Иначе → `valid`

При статусе `expired` → кнопка «Начать смену» в мобилке заблокирована.

### 7.4 Движок начислений (DEFERRED)

**ВАЖНО:** формулы расчёта дневных/ночных ставок, переработок, фикса, бонусов — **предоставляются специалистом заказчика на этапе 3**. Не додумываем.

**Архитектурная подготовка (делаем заранее):**
- Модель `payroll_rules` с JSONB-полем `rules_json`
- Абстрактный интерфейс `PayrollCalculator`
- Placeholder-реализация с простейшими правилами для разработки
- Полная реализация — после получения спеки от заказчика

**Контрактная защита:** при получении спеки — **первым делом написать unit-тесты** по 20-30 сценариям, подписать их с заказчиком как приложение к ТЗ. Любые изменения формул после этого — допсоглашение.

### 7.5 Audit log

Пишем в `audit_log` следующие события:
- Создание/удаление/блокировка организации
- Одобрение/отклонение заявки оператора
- Изменение `payment_terms`
- Ручная корректировка `payroll_calculations`
- Смена роли пользователя
- Экспорт персональных данных

**Не пишем** (слишком много шума): обычное чтение списков, UI-взаимодействия.

---

## 8. UI / Design system

### 8.1 Общий вайб

Linear × Vercel × Samsara. Плотный, тёмный, профессиональный. **Не** playful, **не** glassmorphism, **не** gradient-мусор. Язык — русский и казахский (одинаково полированные).

### 8.2 Цветовая палитра

**Поверхности (multi-layer dark):**

```
Layer 0 (deepest):    #0A0A0B
Layer 1 (base):       #111113
Layer 2 (elevated):   #18181B
Layer 3 (raised):     #1F1F23
Layer 4 (hover):      #27272A
```

**Бордеры:**
```
Subtle:    #27272A
Default:   #2E2E33
Strong:    #3F3F46
```

**Текст:**
```
Primary:    #FAFAFA
Secondary:  #A1A1AA
Tertiary:   #71717A
Disabled:   #52525B
```

**Brand (Jumix orange) — палитра синхронизирована с логотипом:**

База: HSL 27.5° / 95% / 52% (извлечено из `logo-mark.png`, медианный тон градиента).
Шкала Tailwind-like, рассчитана через HSL (только L меняется, H и S фиксированы).

```
brand-50:   #FEF1E6     ← L 95%  (фоны подсказок / toast info)
brand-100:  #FDDBBE     ← L 87%
brand-200:  #FCBA83     ← L 75%
brand-300:  #FA9947     ← L 63%
brand-400:  #FA8B2E     ← L 58%  (hover)
brand-500:  #F97B10     ← L 52%  ОСНОВНОЙ (brand color, CTA, logo-mid)
brand-600:  #E06A06     ← L 45%  (pressed / active)
brand-700:  #BD5905     ← L 38%
brand-800:  #954604     ← L 30%
brand-900:  #723603     ← L 23%
```

Градиентные края логотипа: низ-слева `#FC5511`, верх-справа `#FDA714` — можно использовать для hero-секций и декоративных элементов, не для UI-контролов.

**Правило использования brand-оранжевого:** 2-5% экрана. Primary CTA, активный пункт sidebar, фокус-ring, ключевые метрики. НЕ для кнопок массово, НЕ для бордеров карточек, НЕ для иконок в sidebar (кроме активной).

**Семантические цвета:**
```
Success:  #10B981 (emerald-500)
Warning:  #EAB308 (yellow-500) ← НЕ orange, иначе путается с brand
Danger:   #EF4444 (red-500)
Info:     #3B82F6 (blue-500)
Neutral:  #71717A (zinc-500)
```

### 8.3 Типографика

- **Основной:** Inter variable (поддерживает кириллицу и казахский)
- **Monospace:** JetBrains Mono (для ID, кода, инвентарных номеров)
- Цифры в таблицах: `font-feature-settings: "tnum"` (выравнивание)

**Шкала:**
```
Display: 32/40, weight 600
Heading: 24/32, weight 600
Subhead: 18/28, weight 600
Body-L:  16/24, weight 400
Body:    14/20, weight 400  ← основа
Caption: 12/16, weight 500
Micro:   11/14, weight 500
```

Никакого weight 700 — выглядит кричаще на dark theme.

### 8.4 Spacing

Grid 4px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

**Плотность:**
- Строки таблиц: 40-44 px (compact 36)
- Инпуты: 36-40 px
- Кнопки: 32 / 36 / 40 px
- Padding карточек: 16-20 px

### 8.5 Компоненты

**Sidebar (240/64 px):**
Секции `OPERATIONS / PEOPLE / FINANCE / MANAGEMENT`. Активный пункт: оранжевая точка (2 px) слева + фон Layer 2. Логотип Jumix вверху, user switcher + language toggle внизу.

**Top bar (56 px):**
Breadcrumbs | Global search (Cmd+K) | Notifications bell | Аватар

**Data tables:**
- 44 px строки, hover → оранжевая полоска слева 2px
- Клик на строку → drawer справа (не модалка, не новая страница)
- Фильтры как chips над таблицей
- Density toggle: Compact / Default / Relaxed

**Status badges:**
- Dot + text, bg цвет статуса с 10-15% opacity, 1px border того же цвета
- Высота 22 px, text 12 px medium
- Warning всегда с иконкой (чтобы не путать с brand)

**Maps:**
- MapLibre GL JS + Protomaps tiles
- Dark style с оранжевыми метками активных смен, серыми — вне объекта, красными — проблемы
- Geofence = круг 10% opacity оранжевой заливки + 1 px stroke

### 8.6 Иконки

- База: **Lucide** (stroke 1.5 px)
- Домен: **Tabler Icons** (`crane`, `helmet`, `hard-hat`)
- Размеры: 16 / 20 / 24 px
- Все иконки в одном стиле (outline, не mix с filled)

### 8.7 Копирайт (UI текст)

- Не улыбчивый, не корпоративно-формальный
- Технический и точный: «Крановщик Иванов И.И. вне геозоны объекта. Расстояние: 312 м»
- Без emoji в UI

### 8.8 Логотип

**Структура `apps/web/public/brand/`:**

| Файл | Источник | Размер | Использование |
|---|---|---|---|
| `logo-full.png` | от дизайнера | 5504×1642 | Sidebar (развёрнутый), login-экран, email-шапки |
| `logo-mark.png` | от дизайнера | 1650×1642 | Favicon, PWA-иконка, collapsed sidebar, push-notification icon |

**Извлечение brand-палитры:** `python3 scripts/brand-color.py` (см. §8.2). Медианный HEX `#F97B10` совпадает с `brand-500`.

**Что нужно получить от дизайнера (backlog):**
- **SVG-версии** обоих лого — для lossless ресайза (favicon 16/32/180, retina). См. `docs/architecture/adr/0001-logo-assets.md`.
- **Монохромная версия** (белая на прозрачном) — для некоторых поверхностей (white-label отчёты, тёмные email-шапки).

**Не использовать прямо PNG 5504×1642 в продакшене** — при инлайне в Next.js он отдаёт полный размер. Для sidebar (реальный размер ~120×36) использовать `next/image` с явными `width`/`height` + `sizes` или экспортировать уменьшенные варианты `logo-full@1x.png`, `logo-full@2x.png` после получения SVG.

### 8.9 Light theme

**НЕ делаем в MVP.** Архитектура через CSS-переменные поддерживает, добавим позже.

---

## 9. Mobile app — особенности

### 9.1 UX-особенности для крановщика

Пользователи — мужчины 35-55 лет, работают на стройке в каске и перчатках. UI должен быть:
- **Крупные touch targets** (минимум 48 px)
- **Высокий контраст** (стройка на солнце)
- **Минимум экранов** для ключевых действий (начать смену в 1 тап после разблокировки)
- **Работа без интернета (base)** — начатая смена сохраняется в AsyncStorage, синхронизируется когда появится сеть

### 9.2 Ключевые экраны

1. **Вход** (phone + SMS / phone + password)
2. **Статус заявки** (pending / rejected)
3. **Главный экран:** большая кнопка «Начать смену» / «Завершить смену» (в зависимости от статуса), текущий объект, текущий кран
4. **Подтверждение СИЗ** (чекбокс + опциональное фото) — перед стартом смены
5. **История смен**
6. **Баланс заработка**
7. **Сообщить о неисправности**
8. **Запрос замены**
9. **Оценка организации**
10. **Профиль**

### 9.3 GPS / geolocation

- `expo-location` с `accuracy: Location.Accuracy.BestForNavigation`
- Разрешение запрашивается при первом старте смены, с объяснением зачем
- Фиксация координат **только в момент нажатия кнопок старт/конец**, фоновый tracking НЕ используем (приватность + батарея)
- При плохом GPS (accuracy > 50 м) — показываем предупреждение, но не блокируем

### 9.4 Push-уведомления

- `expo-notifications` → FCM
- Типы: approval заявки, запрос замены, смена статуса неисправности, предупреждение об истечении документов, погода (если релевантно)
- Deep linking в нужный экран приложения

### 9.5 Offline-стратегия

**MVP-минимум:**
- Залогиненный пользователь может открыть приложение без сети
- Начатая смена сохраняется локально, отправляется при восстановлении сети
- Последние данные профиля/баланса кешируются (React Query persist)
- Фото СИЗ сохраняются локально, upload при появлении сети

**Не делаем в MVP:** полноценный offline-first с конфликт-резолюшеном.

---

## 10. Infrastructure — Docker

### 10.1 docker-compose.dev.yml (разработка)

Минимальный набор для локальной разработки:
- `postgres` (с PostGIS)
- `redis`
- `minio`
- `mailhog` (для тестирования email)

API и Web запускаются локально через `pnpm dev` (hot reload).

### 10.2 docker-compose.prod.yml (production)

```
services:
  nginx:       # reverse proxy + SSL + rate limit
  api:         # Fastify, масштабируется
  worker:      # BullMQ processor, отдельный контейнер
  postgres:    # с PostGIS, volume на отдельном диске
  redis:       # persistence enabled
  minio:       # volume для файлов
  backup:      # cron + pg_dump + S3 upload
  uptime:      # Uptime Kuma (мониторинг)
```

### 10.3 Критичные настройки

**Volumes:**
- Размещать на **отдельном диске**, не на системном
- Named volumes с явной конфигурацией

**Restart policy:**
```yaml
restart: unless-stopped
```

**Healthcheck на всех stateful:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U jumix"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 30s
```

**depends_on с условием:**
```yaml
depends_on:
  postgres:
    condition: service_healthy
```

**Graceful shutdown (код API):**
```typescript
process.on('SIGTERM', async () => {
  await app.close()
  await db.end()
  await redis.quit()
  process.exit(0)
})
```

**Log rotation:**
```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

### 10.4 Backup стратегия

**Уровни:**
1. Daily `pg_dump` в S3 (retention 30 дней)
2. Weekly full base backup (retention 12 недель)
3. Monthly offsite copy (retention 12 месяцев)
4. WAL archiving (post-MVP, через pgBackRest)

**Требования:**
- Шифрование на клиенте (gpg) или серверное (SSE-C)
- **Автоматическая проверка восстановления** раз в месяц (GitHub Actions job: скачать → развернуть в test БД → smoke тесты → отчёт в Telegram)
- **Алерт если последний успешный бэкап > 24 часов назад**

### 10.5 Мониторинг

**MVP (обязательно):**
- **Uptime Kuma** в отдельном контейнере
- Проверки: `GET /health` API, PG connectivity, Redis ping, disk usage < 80%, backup < 24h
- Уведомления в **Telegram** (канал + личное)

**Post-MVP:** Prometheus + Grafana + Loki + Alertmanager.

### 10.6 Секреты

**MVP:**
- `.env.production` на сервере, права 600, **НЕ в git**
- Монтируется в compose через `env_file`

**Post-MVP:** Docker Secrets или Infisical.

---

## 11. CI/CD — GitHub Actions

### 11.1 Пайплайн

**На PR / push в feature branch:**
```
lint (Biome) → typecheck (tsc --noEmit) → unit tests →
integration tests (с Testcontainers) → security scan (gitleaks, npm audit) →
CodeRabbit автоматические комментарии
```

**На merge в main:**
```
все проверки выше →
build Docker images (api, worker, web) →
push в GHCR с тегами `latest` и `sha-<commit>` →
auto-deploy на staging →
smoke tests на staging URL →
уведомление в Telegram
```

**На Git tag `v*.*.*`:**
```
все проверки выше →
manual approval (GitHub Environment: production) →
deploy на production →
health check (2 минуты) →
auto-rollback при failure →
уведомление в Telegram с changelog
```

### 11.2 Миграции БД

**Применяются ДО старта новой версии API.** Отдельный шаг в pipeline:
```
ssh prod "cd /opt/jumix && docker compose run --rm api pnpm db:migrate"
```

Только после успеха — `docker compose up -d api worker`.

**Правило:** миграции **обратно совместимы**. Новая версия API должна работать со старой схемой хотя бы 1 релиз (для rollback). Никаких `DROP COLUMN` в том же релизе что код перестаёт использовать колонку.

### 11.3 Rolling deploy

MVP: допустим даунтайм 30-60 секунд при деплое. Post-MVP: zero-downtime через blue-green или канари.

---

## 12. Decision framework — как принимать решения

Когда встречаешь вопрос, не покрытый этим документом:

1. **Безопасность > фичи.** Любая утечка тенант-данных = катастрофа.
2. **Простота > гибкость.** MVP, один разработчик. Не городи абстракции «на будущее».
3. **Явное > неявное.** Типы, валидация, именование. Читаемость важнее краткости.
4. **Тесты > надежды.** Критичные пути покрываются, сомнительные — тем более.
5. **Документация для заказчика.** Всё что может вызвать спор — в ТЗ / допсоглашении / аудит-логе.
6. **Rule of three.** Не выносить в абстракцию пока не встретил паттерн 3 раза.
7. **Стандартные решения.** Нет — переизобретению ORM, auth, queue. Используем проверенные библиотеки.
8. **Не начинать без ТЗ.** Если бизнес-логика неясна (движок начислений) — placeholder + явная пометка «ждём спеку».

---

## 13. Этапы разработки

### Этап 1 (2 месяца): Веб-портал + инфраструктура

**Сентябрь — Октябрь** (условно, от первого платежа)

- [ ] Монорепа, конфиги, CI skeleton
- [ ] Docker dev environment
- [ ] БД: миграции, базовые таблицы
- [ ] Auth: SMS + password, JWT, refresh rotation
- [ ] RBAC: policies, repositories, middleware
- [ ] Веб: 3 кабинета (superadmin / owner / operator)
- [ ] CRUD: organizations, sites, cranes, operators
- [ ] Загрузка документов (MinIO), статус удостоверений
- [ ] i18n RU / KZ
- [ ] Dev-аккаунты Apple/Google (открывает заказчик)
- [ ] Staging развёрнут, CI/CD работает

### Этап 2 (1 месяц): Мобильное приложение + смены

**Ноябрь**

- [ ] Expo проект, navigation, auth flow
- [ ] Экраны: login, home, shifts, profile, balance
- [ ] GPS-фиксация старт/конец смены
- [ ] Геозона: расчёт is_on_site
- [ ] Подтверждение СИЗ с фото
- [ ] Сообщение о неисправности
- [ ] Веб: назначения крановщиков, условия оплаты
- [ ] Веб: live-карта смен, журнал СИЗ, неисправности
- [ ] State machine статусов операторов

### Этап 3 (1 месяц): Финансы + аналитика

**Декабрь**

- [ ] **ПОЛУЧИТЬ от заказчика спеку начислений** (в первую неделю этапа)
- [ ] **Написать unit-тесты** по спеке до кода, подписать с заказчиком
- [ ] Payroll engine: реализация по спеке
- [ ] Табель (автосбор из shifts)
- [ ] Экспорт PDF / Excel
- [ ] Замены: запросы от крановщиков, обработка владельцем
- [ ] Push-уведомления о погоде
- [ ] Аналитика: dashboard с KPI, статистика по объектам/крановщикам
- [ ] Мобилка: баланс, история смен

### Этап 4 (1 месяц): Рейтинги + запуск

**Январь**

- [ ] Рейтинги операторов (5 звёзд + критерии)
- [ ] Рейтинг организаций
- [ ] База «Добросовестные / Недобросовестные»
- [ ] Биржа крановщиков (opt-in, marketplace DTO, contact requests)
- [ ] Push через FCM (полная реализация)
- [ ] Центр уведомлений
- [ ] Финальное тестирование
- [ ] Публикация в App Store + Google Play
- [ ] Документация для заказчика
- [ ] Подписание актов

### Пост-сдача (60 дней гарантия)

- Обработка баг-репортов
- Мелкие правки
- Мониторинг стабильности

---

## 14. Конвенции кода

### 14.1 TypeScript

- `strict: true` в tsconfig
- Никаких `any` без явной причины (и тогда — с комментарием)
- Zod-схемы для всех внешних данных (HTTP request, БД JSON-поля, env vars)
- Типы выводятся из Zod через `z.infer<>`

### 14.2 Именование

- **Файлы:** kebab-case (`operator.service.ts`)
- **Классы:** PascalCase (`OperatorRepository`)
- **Функции/переменные:** camelCase (`findByOrganizationId`)
- **Константы:** SCREAMING_SNAKE_CASE (`MAX_UPLOAD_SIZE_MB`)
- **БД таблицы:** snake_case множественное (`operators`, `refresh_tokens`)
- **БД колонки:** snake_case (`organization_id`, `created_at`)
- **API endpoints:** kebab-case (`/api/v1/marketplace/contact-requests`)

### 14.3 Git

- Branch naming: `feat/operator-crud`, `fix/geofence-edge-case`, `chore/update-deps`
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- PR должны быть маленькими (< 400 строк changed, идеально)
- Squash merge в main

### 14.4 API конвенции

- REST, версионированный через URL: `/api/v1/...`
- Стандартные HTTP статусы (200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500)
- Ошибки в формате:
  ```json
  {
    "error": {
      "code": "OPERATOR_NOT_FOUND",
      "message": "Human readable message",
      "details": { ... }
    }
  }
  ```
- Пагинация: `?page=1&limit=20` или cursor-based для больших списков
- Timestamps в ответах: ISO 8601 UTC
- OpenAPI спека автогенерируется из Zod-схем

### 14.5 Запрещено

- `console.log` в production-коде (только через logger)
- Секреты в коде или `.env` в git
- Raw SQL (кроме миграций и сложных отчётов — с явным ревью)
- `any` без обоснования
- Бизнес-логика в handlers — выносить в services
- Прямые db-запросы из handlers / services — только через repository
- Мутации state без явных причин

---

## 15. Критичные правила для Claude Code

1. **Никогда не пиши auth-логику с нуля.** Используй существующие модули из `packages/auth`. Если нужно изменить — меняй там, а не копируй.

2. **Всегда проверяй tenant scope.** Любой query к данным должен быть scoped по `organization_id` или `user_id` через repository.

3. **Никогда не добавляй endpoint без тестов на авторизацию.** Минимум 4 теста: happy path, wrong role same org, wrong org, unauthenticated.

4. **Никогда не коммить секреты.** Если видишь случайно вставленный токен/пароль — останови, скажи пользователю.

5. **Не трогай движок начислений без спеки от заказчика.** Placeholder — да, реальные формулы — только после получения спеки и написания тестов.

6. **Миграции БД — только вперёд.** Никаких `DROP COLUMN` в том же релизе, где код перестаёт использовать колонку.

7. **При сомнении — спроси.** Не делай предположений в критичной логике (auth, финансы, права доступа).

8. **Обновляй CLAUDE.md** когда архитектурные решения меняются. Но не молча — сначала обсуди с пользователем.

---

## 16. Ссылки и ресурсы

**Документы заказчика:**
- `/docs/contract/ТЕХНИЧЕСКОЕ_ЗАДАНИЕ.docx` — readonly
- `/docs/contract/Договор.docx` — readonly

**Внешние сервисы (доступы управляются заказчиком):**
- Mobizon SMS: https://mobizon.kz
- Firebase (FCM): Firebase console (аккаунт заказчика)
- Apple Developer: App Store Connect (аккаунт заказчика)
- Google Play Console: (аккаунт заказчика)
- Hosting: Hetzner / Cloud.kz
- Monitoring: Uptime Kuma (self-hosted)

**Внутренняя документация** (создаётся по ходу проекта):
- `/docs/architecture/authorization-matrix.md` — полная матрица прав
- `/docs/architecture/adr/` — architectural decision records
- `/docs/runbooks/` — runbook'и на падения, восстановление, деплой
- `/docs/api/` — экспортированная OpenAPI спека для заказчика

---

**End of CLAUDE.md**

Этот документ — единый источник истины. Все расхождения — обсуждать, не игнорировать.
