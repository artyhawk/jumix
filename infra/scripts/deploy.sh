#!/usr/bin/env bash
# VPS-side deploy script (B3-DEPLOY).
#
# Вызывается из GitHub Actions через SSH со следующими env vars:
#   API_IMAGE       — полный tag image API (например ghcr.io/.../jumix-api:sha-abc1234)
#   WEB_IMAGE       — полный tag image web
#   GHCR_USER       — GitHub username для docker login
#   GHCR_TOKEN      — GHCR token (GITHUB_TOKEN из workflow, scope packages:read)
#   SKIP_MIGRATIONS — "true" чтобы пропустить миграции (manual disaster recovery)
#
# Скрипт:
#   1. docker login в GHCR
#   2. Pull новых images (api + web)
#   3. Запуск миграций через одноразовый container API (DATABASE_URL уже в .env.prod)
#   4. up -d --remove-orphans с новыми images
#   5. docker logout (не оставляем токен на VPS)
#   6. Cleanup dangling images

set -euo pipefail

cd "$(dirname "$0")/.."  # → infra/
COMPOSE_FILE="docker/docker-compose.prod.yml"
ENV_FILE="../.env.prod"

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ .env.prod не найден в корне deploy дир"
  echo "  Создай вручную из .env.prod.example один раз перед первым деплоем."
  exit 1
fi

# 1. GHCR login
echo "▸ docker login ghcr.io (as ${GHCR_USER})"
echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER}" --password-stdin

# 2. Pull
echo "▸ Pulling ${API_IMAGE}"
docker pull "${API_IMAGE}"
echo "▸ Pulling ${WEB_IMAGE}"
docker pull "${WEB_IMAGE}"

# Re-tag локально как :latest чтобы compose-pull (без явного image override)
# тоже работал из консоли при ручном вмешательстве.
docker tag "${API_IMAGE}" "ghcr.io/$(echo "${API_IMAGE}" | cut -d/ -f2)/jumix-api:latest"
docker tag "${WEB_IMAGE}" "ghcr.io/$(echo "${WEB_IMAGE}" | cut -d/ -f2)/jumix-web:latest"

export API_IMAGE WEB_IMAGE

# 3. Migrations (если БД доступна — она поднята из предыдущего деплоя)
if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  echo "▸ Ensuring postgres is up"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres
  echo "▸ Waiting for postgres healthcheck"
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps postgres | grep -q "(healthy)"; then
      break
    fi
    sleep 3
  done
  echo "▸ Running migrations"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm \
    --entrypoint sh api -lc "cd /app && pnpm --filter @jumix/db db:migrate"
else
  echo "▸ SKIP_MIGRATIONS=true — пропуск"
fi

# 4. Up
echo "▸ docker compose up -d --remove-orphans"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans

# 5. Logout
echo "▸ docker logout"
docker logout ghcr.io || true

# 6. Cleanup dangling images
echo "▸ Pruning dangling images"
docker image prune -f >/dev/null

echo "✓ Deploy complete"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
