#!/bin/bash
# Jumix — postgres restore (B3-UI-5b).
#
# Usage:
#   ./restore-db.sh /var/lib/jumix/backups/db/jumix-20260423-030001.dump
#
# ВНИМАНИЕ: restore ПЕРЕЗАПИШЕТ текущую БД. Подтверждение требуется
# explicit'но. Для staging restore рекомендуется stop app services first:
#   docker compose -f ... stop api web

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/jumix}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/infra/docker/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.prod}"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <dump-file>" >&2
  exit 2
fi

DUMP="$1"
if [[ ! -f "$DUMP" ]]; then
  echo "error: dump file not found: $DUMP" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "WARNING: это УДАЛИТ всю текущую БД $POSTGRES_DB и восстановит из $DUMP."
read -p "Уверены? (введите 'restore' чтобы продолжить): " -r CONFIRM
if [[ "$CONFIRM" != "restore" ]]; then
  echo "отменено."
  exit 0
fi

echo "[$(date -Iseconds)] drop+recreate db..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE);"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\";"

echo "[$(date -Iseconds)] restoring..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner \
  < "$DUMP"

echo "[$(date -Iseconds)] restore done."
