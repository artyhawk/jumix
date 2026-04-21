import type { FastifyInstance, FastifyPluginAsync } from 'fastify'

/**
 * Health-эндпоинты для Uptime Kuma и orchestrator probes.
 *
 * - GET /health        — liveness: процесс отвечает. Не трогает БД.
 *                        Используется Docker healthcheck как быстрый smoke.
 * - GET /health/ready  — readiness: БД отвечает SELECT 1.
 *                        Используется L7 LB перед переключением трафика.
 *
 * Ready возвращает 503 при недоступной БД — это сигнал orchestrator'у
 * НЕ слать запросы в этот инстанс.
 */
const READINESS_TIMEOUT_MS = 2000

export const registerHealthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'jumix-api',
  }))

  app.get('/health/ready', async (_, reply) => {
    try {
      await Promise.race([
        app.db.sql`select 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('db readiness timeout')), READINESS_TIMEOUT_MS).unref(),
        ),
      ])
      return { status: 'ready', checks: { db: 'ok' } }
    } catch (err) {
      app.log.warn({ err }, 'readiness check failed')
      return reply.code(503).send({
        status: 'not_ready',
        checks: { db: 'down' },
      })
    }
  })
}
