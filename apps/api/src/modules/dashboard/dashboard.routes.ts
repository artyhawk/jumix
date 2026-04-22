import type { FastifyInstance, FastifyPluginAsync } from 'fastify'

/**
 * Dashboard endpoints. Разделение по role — отдельный endpoint вместо
 * polymorphic response (clean typing на frontend, mutual 403'ы).
 *
 *   GET /api/v1/dashboard/stats        superadmin only (platform-wide)
 *   GET /api/v1/dashboard/owner-stats  owner only (org-scoped, B3-UI-3b)
 *
 * Operator аналитики не получает.
 */
export const registerDashboardRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      scoped.get('/stats', async (request) => {
        return app.dashboardService.getStats(request.ctx)
      })

      scoped.get('/owner-stats', async (request) => {
        return app.dashboardService.getOwnerStats(request.ctx)
      })
    },
    { prefix: '/api/v1/dashboard' },
  )
}
