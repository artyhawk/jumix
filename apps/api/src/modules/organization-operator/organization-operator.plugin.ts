import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { registerOrganizationOperatorRoutes } from './organization-operator.routes'
import { OrganizationOperatorService } from './organization-operator.service'

/**
 * Organization-operator-модуль (ADR 0003 pipeline 2): собирает
 * OrganizationOperatorService (singleton) + регистрирует маршруты
 * `/api/v1/organization-operators/*`. Per-request OrganizationOperatorRepository
 * создаётся внутри service'а по ctx из request. Зависит от `authenticate`
 * (для request.ctx).
 */
const organizationOperatorPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new OrganizationOperatorService(app.db, app.log)

  app.decorate('organizationOperatorService', service)
  await app.register(registerOrganizationOperatorRoutes)
}

export default fp(organizationOperatorPlugin, {
  name: 'organization-operator',
  dependencies: ['authenticate'],
})

declare module 'fastify' {
  interface FastifyInstance {
    organizationOperatorService: OrganizationOperatorService
  }
}
