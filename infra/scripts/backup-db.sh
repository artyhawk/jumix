#!/bin/bash
# Jumix — postgres backup (B3-UI-5b).
#
# Запускается из cron на хосте (не из контейнера — проще debug прав
# доступа к /var/lib/jumix/backups). Использует `docker compose exec`
# для pg_dump внутри postgres-контейнера.
#
# Пример cron (3 AM daily):
#   0 3 * * * /opt/jumix/infra/scripts/backup-db.sh >> /var/log/jumix-backup.log 2>&1
#
# Retention: 7 дней локально. Off-site backup (Backblaze B2 / S3 mirror)
# — backlog. Для MVP — manual экспорт раз в неделю (scp жmux-*.dump).

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/jumix}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/infra/docker/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.prod}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/jumix/backups/db}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/jumix-$DATE.dump"

# Загружаем env для $POSTGRES_USER / $POSTGRES_DB.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "[$(date -Iseconds)] backup start → $OUT"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c \
  > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "[$(date -Iseconds)] backup done ($SIZE)"

# Retention: delete dumps older than N days.
find "$BACKUP_DIR" -name 'jumix-*.dump' -mtime +"$RETENTION_DAYS" -print -delete

echo "[$(date -Iseconds)] rotation done — keeping last $RETENTION_DAYS days"
