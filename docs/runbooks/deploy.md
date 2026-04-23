# Jumix — deployment runbook (B3-UI-5b)

Production deployment через docker-compose на любой Linux VPS (Hetzner / Cloud.kz / другой x86_64 Linux с Docker Engine 24+).

## Prerequisites на VPS

- Ubuntu 22.04+ или Debian 12+ (или аналог с systemd)
- Docker Engine 24+ и docker compose plugin v2
- ≥ 4GB RAM, ≥ 40GB disk (backups + MinIO storage)
- Домен направлен A-записью на VPS IP

```bash
# Установка Docker (Ubuntu)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# Logout/login для применения группы
```

## Первоначальная setup

```bash
sudo mkdir -p /opt/jumix
sudo chown "$USER":"$USER" /opt/jumix
cd /opt/jumix

git clone <repo-url> .

# Persistent dirs для volumes + backups + tiles
sudo mkdir -p /var/lib/jumix/{postgres,redis,minio,tiles,backups/db}
sudo chown -R "$USER":"$USER" /var/lib/jumix

# Конфиг
cp .env.prod.example .env.prod
$EDITOR .env.prod  # заполнить ВСЕ REPLACE_WITH_* значения
```

### Генерация секретов

```bash
# POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, JWT_SECRET
openssl rand -base64 32
```

### pmtiles файл (Казахстан, ~500MB)

```bash
# Скачать Kazakhstan region crop
cd /var/lib/jumix/tiles
wget -O kz.pmtiles https://maps.protomaps.com/builds/$(date +%Y%m%d).pmtiles
# Или использовать конкретный build. Альтернатива — сделать crop самостоятельно через tippecanoe.
```

Если пропустить — `PUBLIC_TILES_URL` оставить пустым в `.env.prod`, MapLibre упадёт на public demo endpoint Protomaps.

## Первый запуск

```bash
cd /opt/jumix
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.prod up -d --build

# Проверить health
curl http://localhost/health
# → {"status":"ok","service":"jumix-api"}

curl http://localhost/health/ready
# → {"status":"ready","checks":{"db":"ok"}}
```

## Первый superadmin

Создание через CLI (TODO: B3-UI-5c `scripts/create-superadmin.ts`).

Временно — вручную через psql:

```bash
docker compose -f infra/docker/docker-compose.prod.yml exec postgres psql -U jumix -d jumix
```

```sql
INSERT INTO users (phone, role, name, status, phone_verified_at, created_at, updated_at)
VALUES ('+77001234567', 'superadmin', 'Администратор', 'active', NOW(), NOW(), NOW());
-- Password reset через SMS flow (no password initially).
```

## Миграции БД

Миграции применяются автоматически на старте API контейнера (через drizzle-kit push в entry point) — см. `apps/api/src/server.ts`.

Ручной запуск (troubleshooting):

```bash
docker compose -f infra/docker/docker-compose.prod.yml exec api pnpm --filter @jumix/db migrate:up
```

## Backups

### Запуск

Cron на хосте (не в контейнере):

```bash
crontab -e
# daily 3 AM:
0 3 * * * /opt/jumix/infra/scripts/backup-db.sh >> /var/log/jumix-backup.log 2>&1
```

Backups лежат в `/var/lib/jumix/backups/db/jumix-YYYYMMDD-HHMMSS.dump`.

Retention: 7 дней (настраивается через `RETENTION_DAYS` env в backup-db.sh).

### Restore

```bash
/opt/jumix/infra/scripts/restore-db.sh /var/lib/jumix/backups/db/jumix-20260423-030001.dump
```

⚠ Restore ПЕРЕЗАПИШЕТ текущую БД. Script требует explicit подтверждение.

### Off-site backup (backlog)

Для MVP — manual `scp` раз в неделю на external host. Автоматический sync к Backblaze B2 / S3 — backlog.

## SSL termination

Docker stack слушает только HTTP:80. SSL добавляется на хостовом уровне:

### Вариант 1: certbot standalone (простой)

```bash
# Остановить nginx контейнер пока certbot получает cert
sudo certbot certonly --standalone -d jumix.kz -d www.jumix.kz
# Установить cron для renewal
sudo certbot renew --dry-run
```

Затем подключить cert через сетевой reverse proxy (Caddy / nginx host).

### Вариант 2: Caddy host (рекомендуется)

```bash
# Caddy автоматически управляет SSL через Let's Encrypt
sudo apt install caddy
sudo tee /etc/caddy/Caddyfile <<EOF
jumix.kz {
    reverse_proxy localhost:80
}
EOF
sudo systemctl reload caddy
```

## Мониторинг

### Healthcheck

Docker compose задаёт healthcheck для postgres / redis / minio / api / web. Проверить:

```bash
docker compose -f infra/docker/docker-compose.prod.yml ps
```

Все services должны быть `healthy` или `up`.

### Логи

```bash
# Follow API logs
docker compose -f infra/docker/docker-compose.prod.yml logs -f api

# Все сервисы
docker compose -f infra/docker/docker-compose.prod.yml logs -f
```

Ротация — автоматическая через `json-file` driver (20MB × 5 файлов per service).

### Sentry (optional)

Если `SENTRY_DSN` задан в `.env.prod` — ошибки forward'ятся в Sentry проект. TODO (post-MVP): integration activation после создания Sentry account.

### Uptime monitoring

Uptime Kuma / other внешний monitor — probe'ить:
- `https://jumix.kz/health` — быстрый liveness (< 100ms)
- `https://jumix.kz/health/ready` — readiness (DB check, < 500ms)

Alert если ready возвращает 503 более 2 минут.

## Обновление на новую версию

```bash
cd /opt/jumix
git pull origin main
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.prod pull  # pre-built images
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.prod up -d --build
```

Миграции применяются автоматически на API-start. Zero-downtime deploys — через blue/green (backlog).

## Troubleshooting

### Postgres не стартует

```bash
docker compose -f infra/docker/docker-compose.prod.yml logs postgres
```

Типичные причины:
- Permissions на `/var/lib/jumix/postgres` — должен быть owned user `999` (postgres container uid)
- Port 5432 занят другим процессом

### MinIO 403 на uploads

Проверить что bucket создан:

```bash
docker compose -f infra/docker/docker-compose.prod.yml exec minio \
  mc alias set local http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
docker compose -f infra/docker/docker-compose.prod.yml exec minio \
  mc mb local/jumix-prod || true
```

### Next.js 500 errors

Проверить `NEXT_PUBLIC_API_URL` в `.env.prod` — должен быть reachable от web container (через internal `http://api:3000` или через public URL).

### Tile loading очень медленно

Если self-hosted pmtiles — убедиться что nginx отдаёт с `Accept-Ranges: bytes`:

```bash
curl -I https://jumix.kz/tiles/kz.pmtiles
# Должен быть: Accept-Ranges: bytes
```
