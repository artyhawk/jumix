import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { registerCraneProfileRoutes } from './crane-profile.routes'
import { CraneProfileService } from './crane-profile.service'

/**
 * Crane-profile модуль: собирает CraneProfileService (singleton) + регистрирует
 * маршруты. Per-request CraneProfileRepository(db, ctx) создаётся внутри
 * service-методов по ctx из request.
 *
 * Зависит от `authenticate` (request.ctx) и `storage` (avatar flow).
 */
const craneProfilePlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new CraneProfileService(app.db, app.storage, app.log)

  app.decorate('craneProfileService', service)
  await app.register(registerCraneProfileRoutes)
}

export default fp(craneProfilePlugin, {
  name: 'crane-profile',
  dependencies: ['authenticate', 'storage'],
})

declare module 'fastify' {
  interface FastifyInstance {
    craneProfileService: CraneProfileService
  }
}
