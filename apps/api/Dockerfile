# syntax=docker/dockerfile:1.7
# Multi-stage Dockerfile для Fastify API (B3-UI-5b).
# Запуск через tsx в production (не компилируем в JS) — упрощает монорепу:
# packages/* переиспользуют тот же source tree.

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---------- deps ----------
# Копируем только манифесты чтобы кэшировать installed deps при изменениях
# кода без pnpm install.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/api-types/package.json packages/api-types/package.json
# Frozen install — в prod не обновляем versions "на лету".
RUN pnpm install --frozen-lockfile

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Непривилегированный user — harden surface.
RUN addgroup -g 1001 -S nodejs && adduser -S jumix -u 1001 -G nodejs

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/packages /app/packages
COPY --from=deps /app/apps/api/node_modules /app/apps/api/node_modules
COPY --chown=jumix:nodejs . .

USER jumix

EXPOSE 3000

# Healthcheck через встроенный /health endpoint (см. routes/health.ts).
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

WORKDIR /app/apps/api
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
