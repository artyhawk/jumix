# Jumix

SaaS-платформа управления крановщиками. Монорепа: Next.js + Fastify + React Native + Drizzle ORM + PostgreSQL/PostGIS.

> **Единый источник истины:** [`CLAUDE.md`](./CLAUDE.md) — архитектура, конвенции, бизнес-логика. Читать перед любой задачей.

## Quick start

**Требования:**
- Node.js 22 LTS (`nvm use` подхватит из `.nvmrc`)
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker + Docker Compose

```bash
# 1. Зависимости
pnpm install

# 2. Переменные окружения
cp .env.example .env
# отредактируй .env (DATABASE_URL, JWT ключи, Mobizon и т.д.)

# 3. Инфраструктура (Postgres + Redis + MinIO + MailHog)
pnpm docker:dev:up

# 4. Миграции БД (после того как packages/db будет готов)
pnpm --filter @jumix/db db:migrate
pnpm --filter @jumix/db db:seed

# 5. Запуск всех сервисов в dev-режиме
pnpm dev
```

**Остановить инфру:** `pnpm docker:dev:down`

## Структура

```
apps/
  api/       Fastify backend (REST + OpenAPI)
  worker/    BullMQ job processor (SMS, push, cron, payroll)
  web/       Next.js 15 админ-портал
  mobile/    Expo + React Native (крановщик)
packages/
  db/        Drizzle schema, миграции, seed
  shared/    Общие Zod-схемы, типы, константы
  auth/      JWT, refresh rotation, RBAC policies
  api-types/ Автогенерированные OpenAPI типы
  config/    tsconfig base/node/react
infra/
  docker/    compose файлы (dev / prod)
  nginx/     reverse proxy конфиги
  scripts/   деплой, бэкап, восстановление
docs/
  architecture/  ADR, диаграммы, authorization-matrix
  runbooks/      что делать при падениях
  contract/      ТЗ и договор (не в git)
```

Подробно — [`CLAUDE.md §3`](./CLAUDE.md).

## Команды

| Команда | Что делает |
|---|---|
| `pnpm dev` | Все приложения в watch-режиме |
| `pnpm build` | Сборка всех воркспейсов |
| `pnpm lint` | Biome check по всей монорепе |
| `pnpm typecheck` | `tsc --noEmit` по всем воркспейсам |
| `pnpm test` | Все тесты (Vitest) |
| `pnpm docker:dev:up/down` | Управление dev-инфрой |

## Договор и сроки

- Заказчик: ТОО «Telse», Шымкент
- Договор: №T35.5/26 от 17 апреля 2026
- Срок: 5 месяцев с первого платежа
- Этапы: см. [`CLAUDE.md §13`](./CLAUDE.md)

## Поддержка

Баги и feedback — через Issues. Для критичных путей (auth, финансы) — см. `.github/CODEOWNERS`.
