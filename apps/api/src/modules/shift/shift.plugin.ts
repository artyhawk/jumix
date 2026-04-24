import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { registerShiftRoutes } from './shift.routes'
import { ShiftService } from './shift.service'

/**
 * Shifts module (M4, ADR 0006). ShiftService singleton + маршруты.
 * Зависит от crane-profile модуля (canWork computation reused).
 */
const shiftPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new ShiftService(app.db, app.craneProfileService, app.log)
  app.decorate('shiftService', service)
  await app.register(registerShiftRoutes)
}

export default fp(shiftPlugin, {
  name: 'shift',
  dependencies: ['authenticate', 'crane-profile'],
})

declare module 'fastify' {
  interface FastifyInstance {
    shiftService: ShiftService
  }
}
