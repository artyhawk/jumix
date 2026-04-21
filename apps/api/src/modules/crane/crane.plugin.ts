import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { registerCraneRoutes } from './crane.routes'
import { CraneService } from './crane.service'

/**
 * Cranes-модуль: CraneService singleton + маршруты. Per-request
 * CraneRepository/SiteRepository создаются внутри service-методов по ctx.
 */
const cranePlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new CraneService(app.db, app.log)
  app.decorate('craneService', service)
  await app.register(registerCraneRoutes)
}

export default fp(cranePlugin, {
  name: 'crane',
  dependencies: ['authenticate'],
})

declare module 'fastify' {
  interface FastifyInstance {
    craneService: CraneService
  }
}
