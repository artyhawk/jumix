import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { registerSiteRoutes } from './site.routes'
import { SiteService } from './site.service'

/**
 * Sites-модуль: собирает SiteService (singleton) и регистрирует маршруты.
 * Per-request `SiteRepository(db, ctx)` создаётся внутри service-методов по
 * ctx из request.
 */
const sitePlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new SiteService(app.db, app.log)
  app.decorate('siteService', service)
  await app.register(registerSiteRoutes)
}

export default fp(sitePlugin, {
  name: 'site',
  dependencies: ['authenticate'],
})

declare module 'fastify' {
  interface FastifyInstance {
    siteService: SiteService
  }
}
