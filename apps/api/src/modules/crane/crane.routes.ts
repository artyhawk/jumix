import type { Crane } from '@jumix/db'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import {
  craneIdParamsSchema,
  createCraneSchema,
  listCranesQuerySchema,
  updateCraneSchema,
} from './crane.schemas'

/**
 * Cranes REST endpoints.
 *
 *   GET    /api/v1/cranes              owner: свои, superadmin: все, operator: 403
 *   GET    /api/v1/cranes/:id          owner своей org, superadmin — любой
 *   POST   /api/v1/cranes              owner (superadmin 403 — как у sites)
 *   PATCH  /api/v1/cranes/:id          owner своей org, superadmin — любой
 *   DELETE /api/v1/cranes/:id          soft-delete, owner своей org, superadmin — любой
 *   POST   /api/v1/cranes/:id/activate     status → active
 *   POST   /api/v1/cranes/:id/maintenance  status → maintenance
 *   POST   /api/v1/cranes/:id/retire       status → retired (terminal)
 *
 * Все под authenticate. Policy/scope в service, handler только парсит и DTO.
 */
export const registerCraneRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      scoped.get('/', async (request) => {
        const query = listCranesQuerySchema.parse(request.query)
        const { rows, nextCursor } = await app.craneService.list(request.ctx, query)
        return {
          items: rows.map(toPublicDTO),
          nextCursor,
        }
      })

      scoped.get('/:id', async (request) => {
        const { id } = craneIdParamsSchema.parse(request.params)
        const crane = await app.craneService.getById(request.ctx, id)
        return toPublicDTO(crane)
      })

      scoped.post('/', async (request, reply) => {
        const body = createCraneSchema.parse(request.body)
        const crane = await app.craneService.create(request.ctx, body, {
          ipAddress: request.ip,
        })
        reply.code(201)
        return toPublicDTO(crane)
      })

      scoped.patch('/:id', async (request) => {
        const { id } = craneIdParamsSchema.parse(request.params)
        const patch = updateCraneSchema.parse(request.body)
        const crane = await app.craneService.update(request.ctx, id, patch, {
          ipAddress: request.ip,
        })
        return toPublicDTO(crane)
      })

      scoped.delete('/:id', async (request) => {
        const { id } = craneIdParamsSchema.parse(request.params)
        const crane = await app.craneService.softDelete(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toPublicDTO(crane)
      })

      scoped.post('/:id/activate', async (request) => {
        const { id } = craneIdParamsSchema.parse(request.params)
        const crane = await app.craneService.changeStatus(request.ctx, id, 'active', {
          ipAddress: request.ip,
        })
        return toPublicDTO(crane)
      })

      scoped.post('/:id/maintenance', async (request) => {
        const { id } = craneIdParamsSchema.parse(request.params)
        const crane = await app.craneService.changeStatus(request.ctx, id, 'maintenance', {
          ipAddress: request.ip,
        })
        return toPublicDTO(crane)
      })

      scoped.post('/:id/retire', async (request) => {
        const { id } = craneIdParamsSchema.parse(request.params)
        const crane = await app.craneService.changeStatus(request.ctx, id, 'retired', {
          ipAddress: request.ip,
        })
        return toPublicDTO(crane)
      })
    },
    { prefix: '/api/v1/cranes' },
  )
}

type PublicCraneDTO = {
  id: string
  organizationId: string
  siteId: string | null
  type: 'tower' | 'mobile' | 'crawler' | 'overhead'
  model: string
  inventoryNumber: string | null
  capacityTon: number
  boomLengthM: number | null
  yearManufactured: number | null
  tariffsJson: Record<string, unknown>
  status: 'active' | 'maintenance' | 'retired'
  notes: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

function toPublicDTO(crane: Crane): PublicCraneDTO {
  return {
    id: crane.id,
    organizationId: crane.organizationId,
    siteId: crane.siteId,
    type: crane.type,
    model: crane.model,
    inventoryNumber: crane.inventoryNumber,
    capacityTon: crane.capacityTon,
    boomLengthM: crane.boomLengthM,
    yearManufactured: crane.yearManufactured,
    tariffsJson: crane.tariffsJson,
    status: crane.status,
    notes: crane.notes,
    deletedAt: crane.deletedAt ? crane.deletedAt.toISOString() : null,
    createdAt: crane.createdAt.toISOString(),
    updatedAt: crane.updatedAt.toISOString(),
  }
}
