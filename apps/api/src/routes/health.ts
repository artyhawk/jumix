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
export const registerHealthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'jumix-api',
  }))

  app.get('/health/ready', async (_, reply) => {
    try {
      await app.db.sql`select 1`
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
