import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()

/**
 * Audit read endpoints — только суперадмин.
 *
 *   GET /api/v1/audit/recent?limit=N    default 50, max 100
 *
 * Per-entity history / filter by action / filter by target — backlog.
 */
export const registerAuditRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      scoped.get('/recent', async (request) => {
        const query = querySchema.parse(request.query)
        const events = await app.auditService.getRecent(request.ctx, query.limit)
        return { events }
      })
    },
    { prefix: '/api/v1/audit' },
  )
}
