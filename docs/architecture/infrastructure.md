# Infrastructure — Docker

> Extracted from CLAUDE.md §10. Docker compose (dev/prod), critical settings, backups, monitoring, secrets.

## 10.1 docker-compose.dev.yml (разработка)

Минимальный набор для локальной разработки:
- `postgres` (с PostGIS)
- `redis`
- `minio`
- `mailhog` (для тестирования email)

API и Web запускаются локально через `pnpm dev` (hot reload).

## 10.2 docker-compose.prod.yml (production)

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

## 10.3 Критичные настройки

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

## 10.4 Backup стратегия

**Уровни:**
1. Daily `pg_dump` в S3 (retention 30 дней)
2. Weekly full base backup (retention 12 недель)
3. Monthly offsite copy (retention 12 месяцев)
4. WAL archiving (post-MVP, через pgBackRest)

**Требования:**
- Шифрование на клиенте (gpg) или серверное (SSE-C)
- **Автоматическая проверка восстановления** раз в месяц (GitHub Actions job: скачать → развернуть в test БД → smoke тесты → отчёт в Telegram)
- **Алерт если последний успешный бэкап > 24 часов назад**

## 10.5 Мониторинг

**MVP (обязательно):**
- **Uptime Kuma** в отдельном контейнере
- Проверки: `GET /health` API, PG connectivity, Redis ping, disk usage < 80%, backup < 24h
- Уведомления в **Telegram** (канал + личное)

**Post-MVP:** Prometheus + Grafana + Loki + Alertmanager.

## 10.6 Секреты

**MVP:**
- `.env.production` на сервере, права 600, **НЕ в git**
- Монтируется в compose через `env_file`

**Post-MVP:** Docker Secrets или Infisical.
