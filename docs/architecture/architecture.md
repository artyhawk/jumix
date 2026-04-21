# Architecture — монорепа и слои

> Extracted from CLAUDE.md §3. Монорепа layout, слоистая API-архитектура, structure of apps/api and apps/worker.

## 3.1 Монорепа

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
├── CLAUDE.md             # Индекс + критичные правила (см. [index.md](index.md))
├── README.md
├── package.json          # pnpm workspace root
├── pnpm-workspace.yaml
├── .coderabbit.yaml
├── lefthook.yml
├── biome.json
└── (assets брендинга живут в apps/web/public/brand/, см. [design-system.md](design-system.md) §8.8)
```

## 3.2 API — слоистая архитектура

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

## 3.3 Структура `apps/api`

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

## 3.4 Структура `apps/worker`

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
