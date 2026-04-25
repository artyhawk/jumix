import type { CraneType } from '@jumix/shared'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { IncidentWithRelations } from './incident.repository'
import {
  createIncidentSchema,
  escalateIncidentSchema,
  idParamSchema,
  listMyQuerySchema,
  listOrgQuerySchema,
  requestPhotoUploadUrlSchema,
  resolveIncidentSchema,
} from './incident.schemas'

/**
 * Incident REST endpoints (M6, ADR 0008).
 *
 *   POST  /api/v1/incidents/photos/upload-url      operator; presigned PUT
 *   POST  /api/v1/incidents                         operator; create + photos
 *   GET   /api/v1/incidents/my                      operator; own list
 *   GET   /api/v1/incidents/owner                   owner/superadmin; org-scoped list
 *   GET   /api/v1/incidents/:id                     scoped detail (с photoUrls)
 *   POST  /api/v1/incidents/:id/acknowledge         owner/superadmin
 *   POST  /api/v1/incidents/:id/resolve             owner/superadmin (escalated → superadmin)
 *   POST  /api/v1/incidents/:id/escalate            owner only
 *   POST  /api/v1/incidents/:id/de-escalate         superadmin only
 */
export const registerIncidentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      scoped.post('/photos/upload-url', async (request) => {
        const body = requestPhotoUploadUrlSchema.parse(request.body)
        return app.incidentService.requestPhotoUploadUrl(request.ctx, body)
      })

      scoped.post('/', async (request, reply) => {
        const body = createIncidentSchema.parse(request.body)
        const created = await app.incidentService.create(request.ctx, body, {
          ipAddress: request.ip,
        })
        reply.code(201)
        return toIncidentDTO(created)
      })

      scoped.get('/my', async (request) => {
        const query = listMyQuerySchema.parse(request.query)
        const { rows, nextCursor } = await app.incidentService.listMy(request.ctx, query)
        return { items: rows.map(toIncidentDTO), nextCursor }
      })

      scoped.get('/owner', async (request) => {
        const query = listOrgQuerySchema.parse(request.query)
        const { rows, nextCursor } = await app.incidentService.listOrg(request.ctx, query)
        return { items: rows.map(toIncidentDTO), nextCursor }
      })

      scoped.get('/:id', async (request) => {
        const { id } = idParamSchema.parse(request.params)
        const inc = await app.incidentService.getById(request.ctx, id)
        return toIncidentDTOWithPhotoUrls(inc)
      })

      scoped.post('/:id/acknowledge', async (request) => {
        const { id } = idParamSchema.parse(request.params)
        const inc = await app.incidentService.acknowledge(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toIncidentDTO(inc)
      })

      scoped.post('/:id/resolve', async (request) => {
        const { id } = idParamSchema.parse(request.params)
        const body = resolveIncidentSchema.parse(request.body ?? {})
        const inc = await app.incidentService.resolve(request.ctx, id, body, {
          ipAddress: request.ip,
        })
        return toIncidentDTO(inc)
      })

      scoped.post('/:id/escalate', async (request) => {
        const { id } = idParamSchema.parse(request.params)
        const body = escalateIncidentSchema.parse(request.body ?? {})
        const inc = await app.incidentService.escalate(request.ctx, id, body, {
          ipAddress: request.ip,
        })
        return toIncidentDTO(inc)
      })

      scoped.post('/:id/de-escalate', async (request) => {
        const { id } = idParamSchema.parse(request.params)
        const inc = await app.incidentService.deEscalate(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toIncidentDTO(inc)
      })
    },
    { prefix: '/api/v1/incidents' },
  )
}

type IncidentPublicDTO = {
  id: string
  reporter: { id: string; name: string; phone: string }
  organizationId: string
  shiftId: string | null
  siteId: string | null
  craneId: string | null
  type: string
  severity: string
  status: string
  description: string
  reportedAt: string
  acknowledgedAt: string | null
  acknowledgedByUserId: string | null
  resolvedAt: string | null
  resolvedByUserId: string | null
  resolutionNotes: string | null
  latitude: number | null
  longitude: number | null
  photos: Array<{ id: string; storageKey: string; url?: string; uploadedAt: string }>
  shift: { id: string; startedAt: string; endedAt: string | null } | null
  site: { id: string; name: string; address: string | null } | null
  crane: {
    id: string
    model: string
    inventoryNumber: string | null
    type: CraneType
  } | null
  createdAt: string
  updatedAt: string
}

function toIncidentDTO(item: IncidentWithRelations): IncidentPublicDTO {
  const i = item.incident
  return {
    id: i.id,
    reporter: {
      id: i.reporterUserId,
      name: i.reporterName,
      phone: i.reporterPhone,
    },
    organizationId: i.organizationId,
    shiftId: i.shiftId,
    siteId: i.siteId,
    craneId: i.craneId,
    type: i.type,
    severity: i.severity,
    status: i.status,
    description: i.description,
    reportedAt: i.reportedAt.toISOString(),
    acknowledgedAt: i.acknowledgedAt ? i.acknowledgedAt.toISOString() : null,
    acknowledgedByUserId: i.acknowledgedByUserId,
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    resolvedByUserId: i.resolvedByUserId,
    resolutionNotes: i.resolutionNotes,
    latitude: i.latitude,
    longitude: i.longitude,
    photos: item.photos.map((p) => ({
      id: p.id,
      storageKey: p.storageKey,
      uploadedAt: p.uploadedAt.toISOString(),
    })),
    shift: item.relations.shift
      ? {
          id: item.relations.shift.id,
          startedAt: item.relations.shift.startedAt.toISOString(),
          endedAt: item.relations.shift.endedAt ? item.relations.shift.endedAt.toISOString() : null,
        }
      : null,
    site: item.relations.site,
    crane: item.relations.crane
      ? {
          id: item.relations.crane.id,
          model: item.relations.crane.model,
          inventoryNumber: item.relations.crane.inventoryNumber,
          type: item.relations.crane.type,
        }
      : null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }
}

function toIncidentDTOWithPhotoUrls(
  item: IncidentWithRelations & { photoUrls: Record<string, string> },
): IncidentPublicDTO {
  const dto = toIncidentDTO(item)
  return {
    ...dto,
    photos: dto.photos.map((p) => ({
      ...p,
      url: item.photoUrls[p.id],
    })),
  }
}
