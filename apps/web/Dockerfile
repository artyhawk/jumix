# syntax=docker/dockerfile:1.7
# Multi-stage Dockerfile для Next.js web (B3-UI-5b).
# Использует `output: 'standalone'` (next.config.ts) — итоговый image содержит
# только минимальный runtime tree.

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---------- deps: install all + transpile shared pkgs через tsc ----------
FROM base AS deps
# Build tools нужны для transitive native deps (argon2, ssh2) — pnpm install
# с frozen-lockfile видит весь lockfile workspace'а. Не наследуется в runtime.
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

# ---------- builder ----------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/web/node_modules /app/apps/web/node_modules
COPY --from=deps /app/packages /app/packages
COPY . .
RUN pnpm --filter @jumix/web build

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# Standalone output — self-contained. `public/` + `static/` копируются
# отдельно (next/standalone их не включает).
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r => r.status < 500 ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Next.js standalone запускается из корня — server.js в /app/apps/web/
CMD ["node", "apps/web/server.js"]
