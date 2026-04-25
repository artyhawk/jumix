import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { registerIncidentRoutes } from './incident.routes'
import { IncidentService } from './incident.service'

const incidentPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new IncidentService(app.db, app.storage, app.log)
  app.decorate('incidentService', service)
  await app.register(registerIncidentRoutes)
}

export default fp(incidentPlugin, {
  name: 'incident',
  dependencies: ['authenticate', 'storage'],
})

declare module 'fastify' {
  interface FastifyInstance {
    incidentService: IncidentService
  }
}
