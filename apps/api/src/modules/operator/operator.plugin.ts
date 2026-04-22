import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { UserRepository } from '../auth/repositories'
import { registerOperatorRoutes } from './operator.routes'
import { OperatorService } from './operator.service'

/**
 * Operator-модуль: собирает OperatorService (singleton) + регистрирует маршруты.
 * Per-request OperatorRepository(db, ctx) создаётся внутри service-методов
 * по ctx из request. Зависит от `authenticate` (для request.ctx) и storage
 * (для avatar flow — presigned URL, head/delete).
 */
const operatorPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const userRepo = new UserRepository(app.db)
  const service = new OperatorService(app.db, userRepo, app.storage, app.log)

  app.decorate('operatorService', service)
  await app.register(registerOperatorRoutes)
}

export default fp(operatorPlugin, {
  name: 'operator',
  dependencies: ['authenticate', 'storage'],
})

declare module 'fastify' {
  interface FastifyInstance {
    operatorService: OperatorService
  }
}
