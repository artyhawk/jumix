import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { UserRepository } from '../auth/repositories'
import { registerOrganizationRoutes } from './organization.routes'
import { OrganizationService } from './organization.service'

/**
 * Organization-модуль: собирает OrganizationService (singleton) и регистрирует
 * маршруты. Per-request `OrganizationRepository(db, ctx)` создаётся внутри
 * service-методов по ctx из request.
 */
const organizationPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const userRepo = new UserRepository(app.db)
  const service = new OrganizationService(app.db, userRepo, app.log)

  app.decorate('organizationService', service)
  await app.register(registerOrganizationRoutes)
}

export default fp(organizationPlugin, {
  name: 'organization',
  dependencies: ['authenticate'],
})

declare module 'fastify' {
  interface FastifyInstance {
    organizationService: OrganizationService
  }
}
