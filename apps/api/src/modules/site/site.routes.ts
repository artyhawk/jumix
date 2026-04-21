import type { Site } from '@jumix/db'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { round6 } from '../../lib/coords'
import {
  createSiteSchema,
  listSitesQuerySchema,
  siteIdParamsSchema,
  updateSiteSchema,
} from './site.schemas'

/**
 * Sites REST endpoints (CLAUDE.md §14.4).
 *
 *   GET    /api/v1/sites              owner: свои, superadmin: все, operator: 403
 *   GET    /api/v1/sites/:id          owner своей, superadmin любой
 *   POST   /api/v1/sites              owner: создаёт в своей org (superadmin 403)
 *   PATCH  /api/v1/sites/:id          owner своей, superadmin любой
 *   POST   /api/v1/sites/:id/complete     active → completed
 *   POST   /api/v1/sites/:id/archive      → archived
 *   POST   /api/v1/sites/:id/activate     → active
 *
 * Все маршруты под authenticate. Policy/scope checks — в service, не в
 * handler'ах; handler парсит body, зовёт service, мапит на DTO.
 */
export const registerSiteRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      scoped.get('/', async (request) => {
        const query = listSitesQuerySchema.parse(request.query)
        const { rows, nextCursor } = await app.siteService.list(request.ctx, query)
        return {
          items: rows.map(toPublicDTO),
          nextCursor,
        }
      })

      scoped.get('/:id', async (request) => {
        const { id } = siteIdParamsSchema.parse(request.params)
        const site = await app.siteService.getById(request.ctx, id)
        return toPublicDTO(site)
      })

      scoped.post('/', async (request, reply) => {
        const body = createSiteSchema.parse(request.body)
        const site = await app.siteService.create(request.ctx, body, { ipAddress: request.ip })
        reply.code(201)
        return toPublicDTO(site)
      })

      scoped.patch('/:id', async (request) => {
        const { id } = siteIdParamsSchema.parse(request.params)
        const patch = updateSiteSchema.parse(request.body)
        const site = await app.siteService.update(request.ctx, id, patch, {
          ipAddress: request.ip,
        })
        return toPublicDTO(site)
      })

      scoped.post('/:id/complete', async (request) => {
        const { id } = siteIdParamsSchema.parse(request.params)
        const site = await app.siteService.changeStatus(request.ctx, id, 'completed', {
          ipAddress: request.ip,
        })
        return toPublicDTO(site)
      })

      scoped.post('/:id/archive', async (request) => {
        const { id } = siteIdParamsSchema.parse(request.params)
        const site = await app.siteService.changeStatus(request.ctx, id, 'archived', {
          ipAddress: request.ip,
        })
        return toPublicDTO(site)
      })

      scoped.post('/:id/activate', async (request) => {
        const { id } = siteIdParamsSchema.parse(request.params)
        const site = await app.siteService.changeStatus(request.ctx, id, 'active', {
          ipAddress: request.ip,
        })
        return toPublicDTO(site)
      })
    },
    { prefix: '/api/v1/sites' },
  )
}

type PublicSiteDTO = {
  id: string
  organizationId: string
  name: string
  address: string | null
  latitude: number
  longitude: number
  radiusM: number
  status: 'active' | 'completed' | 'archived'
  notes: string | null
  createdAt: string
  updatedAt: string
}

/**
 * DTO-слой. Координаты ещё раз прогоняются через round6 — защита от случая,
 * когда репозиторий пропустил округление (например, в будущем кто-то добавит
 * путь без hydrateSite). Дёшево и идемпотентно.
 */
function toPublicDTO(site: Site): PublicSiteDTO {
  return {
    id: site.id,
    organizationId: site.organizationId,
    name: site.name,
    address: site.address,
    latitude: round6(site.latitude),
    longitude: round6(site.longitude),
    radiusM: site.geofenceRadiusM,
    status: site.status,
    notes: site.notes,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  }
}
