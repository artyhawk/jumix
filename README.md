# Jumix

SaaS-платформа управления крановщиками для Казахстана. Монорепа: **Next.js 15** + **Fastify** + **React Native** (в плане) + **Drizzle ORM** + **PostgreSQL/PostGIS**.

> **Единый источник истины для разработчика:** [`CLAUDE.md`](./CLAUDE.md) — архитектура, конвенции, бизнес-логика, история решений. Читать перед любой задачей.

---

## Статус проекта

- ✅ **Backend:** auth + organizations + sites + cranes + crane_profiles + organization_operators + storage + license flow + audit
- ✅ **Web admin:** 3 кабинета (superadmin / owner / operator) functionally complete
- 🟡 **Mobile app:** в плане (Этап 2) — смены / GPS / СИЗ / incidents
- ✅ **Deploy infrastructure:** Docker prod + Nginx + backups + pmtiles (B3-UI-5b)
- ✅ **1310+ тестов:** 685 API + 525 web + 117 packages

---

## Prerequisites

- **Node.js 22 LTS** (`nvm use` подхватит из `.nvmrc`)
- **pnpm 9+** (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Docker Engine 24+** и docker compose v2
- (prod only) **VPS с публичным IP + domain**

---

## Development setup

```bash
# 1. Зависимости
pnpm install

# 2. Переменные окружения
cp .env.example .env
# Отредактируй .env — как минимум заполни JWT_PRIVATE_KEY / JWT_PUBLIC_KEY
# (openssl genrsa -out private.pem 2048)

# 3. Инфраструктура (Postgres + PostGIS + Redis + MinIO + MailHog)
pnpm docker:dev:up

# 4. Миграции БД
pnpm --filter @jumix/db db:migrate

# 5. (опция) Демо-данные для показа
pnpm --filter @jumix/db db:seed:demo
# superadmin phone: +77001112233, password: JumixDemo123!

# 6. Запуск всех сервисов в dev-режиме
pnpm dev
#   api   → http://localhost:3000
#   web   → http://localhost:3001
#   (mobile — отдельно через Expo, позже)
```

**Остановить инфру:** `pnpm docker:dev:down`

---

## Testing

```bash
pnpm -r test           # вся монорепа
pnpm -r typecheck      # TypeScript strict
pnpm -r lint           # Biome check

# Filtered
pnpm --filter @jumix/api test
pnpm --filter @jumix/web test -- me/page
```

Все тесты должны быть зелёные перед commit (lefthook hook проверит lint + gitleaks).

---

## Production deployment

Docker compose на любой Linux VPS. Полные инструкции — [`docs/runbooks/deploy.md`](./docs/runbooks/deploy.md). TL;DR:

```bash
# На VPS
sudo mkdir -p /opt/jumix
git clone <repo-url> /opt/jumix
cd /opt/jumix

sudo mkdir -p /var/lib/jumix/{postgres,redis,minio,tiles,backups/db}
sudo chown -R "$USER":"$USER" /var/lib/jumix

# Конфиг
cp .env.prod.example .env.prod
$EDITOR .env.prod  # заполнить ВСЕ REPLACE_WITH_*

# (опция) Скачать kz.pmtiles (~500MB) для self-hosted tiles
wget -O /var/lib/jumix/tiles/kz.pmtiles https://maps.protomaps.com/builds/$(date +%Y%m%d).pmtiles

# Запуск
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.prod up -d --build

# Первый superadmin
docker compose -f infra/docker/docker-compose.prod.yml exec api \
  node --import tsx/esm ../../packages/db/scripts/create-superadmin.ts \
  --phone=+77001234567 --name="Администратор" --password='StrongPass123!'
```

SSL termination — на хостовом reverse proxy (Caddy / certbot). Jumix stack слушает только HTTP:80.

### Environment variables (prod)

См. `.env.prod.example`. Критичные секреты (**обязательно заменить**):

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | DB пароль (min 24 chars, `openssl rand -base64 32`) |
| `MINIO_ROOT_PASSWORD` | S3 пароль |
| `JWT_SECRET` / `JWT_PRIVATE_KEY` | JWT подписывание (RS256) |
| `SMS_GATEWAY_KEY` | Mobizon API key |
| `PUBLIC_API_URL` | Публичный URL (обычно `/api` за reverse proxy) |
| `PUBLIC_TILES_URL` | URL к self-hosted `.pmtiles` (optional — fallback на demo) |
| `SENTRY_DSN` | Sentry monitoring (optional) |

### Backup + restore

```bash
# Автоматический cron (ежедневно в 3:00)
crontab -e
# 0 3 * * * /opt/jumix/infra/scripts/backup-db.sh >> /var/log/jumix-backup.log 2>&1

# Manual restore
/opt/jumix/infra/scripts/restore-db.sh /var/lib/jumix/backups/db/jumix-20260423-030001.dump
```

Retention: 7 дней локально. Off-site backup (Backblaze B2) — в backlog.

---

## Структура монорепы

```
apps/
  api/       Fastify backend (REST + OpenAPI)
  worker/    BullMQ job processor (cron, license expiry)
  web/       Next.js 15 admin portal
  mobile/    Expo + React Native (крановщик, в плане)
packages/
  db/        Drizzle schema, миграции, seed, admin CLI
  shared/    Общие Zod-схемы, типы (KZ BIN/IIN валидаторы)
  auth/      JWT, refresh rotation, RBAC policies, password hash
  api-types/ OpenAPI типы (автоген — позже)
  config/    tsconfig base/node/react
infra/
  docker/    compose файлы (dev / prod)
  nginx/     reverse proxy + pmtiles static
  scripts/   backup-db / restore-db
docs/
  architecture/  ADR, design-system, authorization, web-architecture
  runbooks/      deploy.md + incident runbooks
  contract/      ТЗ и договор (readonly)
```

Подробно — [`CLAUDE.md §3`](./CLAUDE.md).

---

## Команды верхнего уровня

| Команда | Что делает |
|---|---|
| `pnpm dev` | Все приложения в watch-режиме |
| `pnpm build` | Сборка всех воркспейсов |
| `pnpm lint` | Biome check |
| `pnpm typecheck` | `tsc --noEmit` по всем workspace |
| `pnpm test` | Все тесты (Vitest) |
| `pnpm docker:dev:up/down` | Управление dev-инфрой |
| `pnpm --filter @jumix/db db:migrate` | Применить миграции |
| `pnpm --filter @jumix/db db:seed:demo` | Демо-данные для показа |
| `pnpm --filter @jumix/db admin:create-superadmin` | Создать superadmin'а |

---

## Документация

### Для разработчика
- **[`CLAUDE.md`](./CLAUDE.md)** — главный design doc (23+ правил, архитектура, конвенции)
- **[`docs/architecture/`](./docs/architecture/)** — детальные specs + ADR (5 шт):
  - [`web-architecture.md`](./docs/architecture/web-architecture.md) — Next.js frontend (§12a-§12f)
  - [`authorization.md`](./docs/architecture/authorization.md) — RBAC 4-layer defense
  - [`business-logic.md`](./docs/architecture/business-logic.md) — геозона, state machines, cron
  - [`storage.md`](./docs/architecture/storage.md) — MinIO + versioning
  - [`backlog.md`](./docs/architecture/backlog.md) — отложенные решения
- **[`docs/runbooks/deploy.md`](./docs/runbooks/deploy.md)** — deploy + SSL + backups + troubleshooting

### Для клиента
- **[`docs/USER_GUIDE.ru.md`](./docs/USER_GUIDE.ru.md)** — руководство по работе с web-кабинетом (superadmin)

---

## Договор и сроки

- **Заказчик:** ТОО «Telse», Шымкент
- **Исполнитель:** ИП Yerbol
- **Договор:** №T35.5/26 от 17 апреля 2026
- **Бюджет:** 1.8 млн ₸
- **Срок:** 5 месяцев (MVP до ~октября 2026)
- **Гарантия:** 60 дней после сдачи
- **Этапы:** см. [`CLAUDE.md §4`](./CLAUDE.md)

---

## Поддержка

По всем техническим вопросам — через Issues или прямой контакт с ИП Yerbol (см. договор).

Для критичных путей (auth, финансы) — см. `.github/CODEOWNERS` (добавить при появлении команды).
