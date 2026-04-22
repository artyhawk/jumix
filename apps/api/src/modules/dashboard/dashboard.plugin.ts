import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { registerDashboardRoutes } from './dashboard.routes'
import { DashboardService } from './dashboard.service'

/**
 * Dashboard-модуль: singleton DashboardService + единственный route /stats.
 * Зависит только от authenticate (нет tenant-scoped repo, запросы через DB
 * напрямую — отчётный read-only path, OK by policy).
 */
const dashboardPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new DashboardService(app.db)

  app.decorate('dashboardService', service)
  await app.register(registerDashboardRoutes)
}

export default fp(dashboardPlugin, {
  name: 'dashboard',
  dependencies: ['authenticate'],
})

declare module 'fastify' {
  interface FastifyInstance {
    dashboardService: DashboardService
  }
}
