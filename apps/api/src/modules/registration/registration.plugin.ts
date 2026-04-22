import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { registerRegistrationRoutes } from './registration.routes'
import { RegistrationService } from './registration.service'

/**
 * Registration-модуль: собирает `RegistrationService` поверх auth-сервисов
 * (переиспользует SMS + tokenIssuer + userRepo + authEvents из auth.plugin).
 *
 * Зависит от `auth`: `app.authServices` должен быть уже декорирован.
 */
const registrationPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const auth = app.authServices
  const service = new RegistrationService(
    app.db,
    auth.sms,
    auth.tokenIssuer,
    auth.userRepo,
    auth.authEvents,
    app.log,
  )
  app.decorate('registrationService', service)

  await app.register(registerRegistrationRoutes)
}

export default fp(registrationPlugin, {
  name: 'registration',
  dependencies: ['auth'],
})

declare module 'fastify' {
  interface FastifyInstance {
    registrationService: RegistrationService
  }
}
