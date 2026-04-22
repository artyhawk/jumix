import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { registerAuditRoutes } from './audit.routes'
import { AuditService } from './audit.service'

/**
 * Audit-модуль: read-only endpoint для последних событий (B3-UI-2d).
 * Write-path живёт в каждом entity-repository через tx.insert(auditLog).
 */
const auditPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new AuditService(app.db)

  app.decorate('auditService', service)
  await app.register(registerAuditRoutes)
}

export default fp(auditPlugin, {
  name: 'audit',
  dependencies: ['authenticate'],
})

declare module 'fastify' {
  interface FastifyInstance {
    auditService: AuditService
  }
}
