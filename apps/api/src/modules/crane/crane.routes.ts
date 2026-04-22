import type { Crane } from '@jumix/db'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import {
  approveCraneSchema,
  assignCraneSiteSchema,
  craneIdParamsSchema,
  createCraneSchema,
  listCranesQuerySchema,
  rejectCraneSchema,
  updateCraneSchema,
} from './crane.schemas'

/**
 * Cranes REST endpoints.
 *
 *   GET    /api/v1/cranes                  owner: свои, superadmin: все, operator: 403
 *                                          query.approvalStatus default='approved';
 *                                          поддерживает pending|approved|rejected|all
 *   GET    /api/v1/cranes/:id              owner своей org, superadmin — любой
 *   POST   /api/v1/cranes                  owner; создаёт pending (ADR 0002)
 *   PATCH  /api/v1/cranes/:id              owner своей org; rejected — 409 CRANE_REJECTED_READONLY
 *   DELETE /api/v1/cranes/:id              soft-delete, любой approval_status
 *   POST   /api/v1/cranes/:id/activate     status → active (требует approved)
 *   POST   /api/v1/cranes/:id/maintenance  status → maintenance (требует approved)
 *   POST   /api/v1/cranes/:id/retire       status → retired (требует approved)
 *   POST   /api/v1/cranes/:id/assign-site body {siteId}; approved + same-org site
 *   POST   /api/v1/cranes/:id/unassign-site siteId → null
 *   POST   /api/v1/cranes/:id/resubmit     rejected → pending (owner own / superadmin)
 *   POST   /api/v1/cranes/:id/approve      superadmin only; pending → approved
 *   POST   /api/v1/cranes/:id/reject       superadmin only; body {reason}; pending → rejected
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

      scoped.post('/:id/assign-site', async (request) => {
        const { id } = craneIdParamsSchema.parse(request.params)
        const body = assignCraneSiteSchema.parse(request.body)
        const crane = await app.craneService.assignToSite(request.ctx, id, body.siteId, {
          ipAddress: request.ip,
        })
        return toPublicDTO(crane)
      })

      scoped.post('/:id/unassign-site', async (request) => {
        const { id } = craneIdParamsSchema.parse(request.params)
        const crane = await app.craneService.unassignFromSite(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toPublicDTO(crane)
      })

      scoped.post('/:id/resubmit', async (request) => {
        const { id } = craneIdParamsSchema.parse(request.params)
        const crane = await app.craneService.resubmit(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toPublicDTO(crane)
      })

      scoped.post('/:id/approve', async (request) => {
        const { id } = craneIdParamsSchema.parse(request.params)
        approveCraneSchema.parse(request.body ?? {})
        const crane = await app.craneService.approve(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toPublicDTO(crane)
      })

      scoped.post('/:id/reject', async (request) => {
        const { id } = craneIdParamsSchema.parse(request.params)
        const body = rejectCraneSchema.parse(request.body)
        const crane = await app.craneService.reject(request.ctx, id, body.reason, {
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
  approvalStatus: 'pending' | 'approved' | 'rejected'
  approvedAt: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  notes: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * DTO boundary: approvedByUserId/rejectedByUserId НЕ возвращаем (internal
 * audit — живёт в audit_log). Даты и reason доступны клиенту.
 */
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
    approvalStatus: crane.approvalStatus,
    approvedAt: crane.approvedAt ? crane.approvedAt.toISOString() : null,
    rejectedAt: crane.rejectedAt ? crane.rejectedAt.toISOString() : null,
    rejectionReason: crane.rejectionReason,
    notes: crane.notes,
    deletedAt: crane.deletedAt ? crane.deletedAt.toISOString() : null,
    createdAt: crane.createdAt.toISOString(),
    updatedAt: crane.updatedAt.toISOString(),
  }
}
