import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { AvailableCrane, ShiftWithRelations } from './shift.repository'
import {
  endShiftSchema,
  listMyShiftsQuerySchema,
  listOwnerShiftsQuerySchema,
  shiftIdParamsSchema,
  startShiftSchema,
} from './shift.schemas'

/**
 * Shifts REST endpoints (M4, ADR 0006).
 *
 *   POST   /api/v1/shifts/start             operator; body {craneId, notes?}; canWork gate
 *   POST   /api/v1/shifts/:id/pause         operator-owner; active → paused
 *   POST   /api/v1/shifts/:id/resume        operator-owner; paused → active
 *   POST   /api/v1/shifts/:id/end           operator-owner; body {notes?}; live → ended
 *   GET    /api/v1/shifts/my                operator; own shifts paginated DESC
 *   GET    /api/v1/shifts/my/active         operator; current live shift or null
 *   GET    /api/v1/shifts/owner             owner/superadmin; filters status/site/crane
 *   GET    /api/v1/shifts/available-cranes  operator; eligible cranes для старта
 *   GET    /api/v1/shifts/:id               scoped detail (operator/owner/superadmin)
 */
export const registerShiftRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      scoped.post('/start', async (request, reply) => {
        const body = startShiftSchema.parse(request.body)
        const shift = await app.shiftService.start(request.ctx, body, {
          ipAddress: request.ip,
        })
        reply.code(201)
        return toShiftDTO(shift)
      })

      scoped.post('/:id/pause', async (request) => {
        const { id } = shiftIdParamsSchema.parse(request.params)
        const shift = await app.shiftService.pause(request.ctx, id, { ipAddress: request.ip })
        return toShiftDTO(shift)
      })

      scoped.post('/:id/resume', async (request) => {
        const { id } = shiftIdParamsSchema.parse(request.params)
        const shift = await app.shiftService.resume(request.ctx, id, { ipAddress: request.ip })
        return toShiftDTO(shift)
      })

      scoped.post('/:id/end', async (request) => {
        const { id } = shiftIdParamsSchema.parse(request.params)
        const body = endShiftSchema.parse(request.body ?? {})
        const shift = await app.shiftService.end(request.ctx, id, body, {
          ipAddress: request.ip,
        })
        return toShiftDTO(shift)
      })

      scoped.get('/my', async (request) => {
        const query = listMyShiftsQuerySchema.parse(request.query)
        const { rows, nextCursor } = await app.shiftService.listMy(request.ctx, query)
        return { items: rows.map(toShiftDTO), nextCursor }
      })

      scoped.get('/my/active', async (request) => {
        const shift = await app.shiftService.getMyActive(request.ctx)
        return shift ? toShiftDTO(shift) : null
      })

      scoped.get('/owner', async (request) => {
        const query = listOwnerShiftsQuerySchema.parse(request.query)
        const { rows, nextCursor } = await app.shiftService.listOrg(request.ctx, query)
        return { items: rows.map(toShiftDTO), nextCursor }
      })

      scoped.get('/available-cranes', async (request) => {
        const cranes = await app.shiftService.getAvailableCranes(request.ctx)
        return { items: cranes.map(toAvailableCraneDTO) }
      })

      scoped.get('/:id', async (request) => {
        const { id } = shiftIdParamsSchema.parse(request.params)
        const shift = await app.shiftService.getById(request.ctx, id)
        return toShiftDTO(shift)
      })
    },
    { prefix: '/api/v1/shifts' },
  )
}

type PublicShiftDTO = {
  id: string
  craneId: string
  operatorId: string
  craneProfileId: string
  organizationId: string
  siteId: string
  status: 'active' | 'paused' | 'ended'
  startedAt: string
  endedAt: string | null
  pausedAt: string | null
  totalPauseSeconds: number
  notes: string | null
  createdAt: string
  updatedAt: string
  crane: {
    id: string
    model: string
    inventoryNumber: string | null
    type: 'tower' | 'mobile' | 'crawler' | 'overhead'
    capacityTon: number
  }
  site: { id: string; name: string; address: string | null }
  organization: { id: string; name: string }
  operator: { id: string; firstName: string; lastName: string; patronymic: string | null }
}

function toShiftDTO(row: ShiftWithRelations): PublicShiftDTO {
  return {
    id: row.shift.id,
    craneId: row.shift.craneId,
    operatorId: row.shift.operatorId,
    craneProfileId: row.shift.craneProfileId,
    organizationId: row.shift.organizationId,
    siteId: row.shift.siteId,
    status: row.shift.status,
    startedAt: row.shift.startedAt.toISOString(),
    endedAt: row.shift.endedAt ? row.shift.endedAt.toISOString() : null,
    pausedAt: row.shift.pausedAt ? row.shift.pausedAt.toISOString() : null,
    totalPauseSeconds: row.shift.totalPauseSeconds,
    notes: row.shift.notes,
    createdAt: row.shift.createdAt.toISOString(),
    updatedAt: row.shift.updatedAt.toISOString(),
    crane: row.crane,
    site: row.site,
    organization: row.organization,
    operator: row.operator,
  }
}

type PublicAvailableCraneDTO = {
  id: string
  model: string
  inventoryNumber: string | null
  type: 'tower' | 'mobile' | 'crawler' | 'overhead'
  capacityTon: number
  site: { id: string; name: string; address: string | null }
  organization: { id: string; name: string }
}

function toAvailableCraneDTO(c: AvailableCrane): PublicAvailableCraneDTO {
  return {
    id: c.id,
    model: c.model,
    inventoryNumber: c.inventoryNumber,
    type: c.type,
    capacityTon: c.capacityTon,
    site: c.site,
    organization: c.organization,
  }
}
