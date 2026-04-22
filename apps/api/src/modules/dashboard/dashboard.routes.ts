import type { FastifyInstance, FastifyPluginAsync } from 'fastify'

/**
 * Dashboard endpoints — пока только stats для суперадмина.
 *
 *   GET /api/v1/dashboard/stats   superadmin only (403 иначе)
 *
 * Owner/operator сюда не лезут — им показываются specific endpoints
 * в своих кабинетах (§3 business-logic).
 */
export const registerDashboardRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      scoped.get('/stats', async (request) => {
        return app.dashboardService.getStats(request.ctx)
      })
    },
    { prefix: '/api/v1/dashboard' },
  )
}
