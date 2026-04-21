import { maskPhone } from '@jumix/shared'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import {
  createOrganizationSchema,
  listOrganizationsQuerySchema,
  organizationIdParamsSchema,
  updateOrganizationSchema,
} from './organization.schemas'

/**
 * Organizations REST endpoints (CLAUDE.md §14.4).
 *
 *   GET    /api/v1/organizations            superadmin: list (cursor)
 *   GET    /api/v1/organizations/me         owner: своя организация
 *   GET    /api/v1/organizations/:id        superadmin | owner-of-:id
 *   POST   /api/v1/organizations            superadmin: create + первый owner
 *   PATCH  /api/v1/organizations/:id        superadmin (все поля) | owner (contacts)
 *   POST   /api/v1/organizations/:id/suspend   superadmin
 *   POST   /api/v1/organizations/:id/activate  superadmin
 *
 * Все маршруты под authenticate — 401 без токена. Policy-checks и tenant scope
 * внутри service (не в handler'ах), handler только парсит body и мапит DTO.
 *
 * `contactPhone` в ответах маскируется — см. §5.2 backlog и enumeration protection.
 */
export const registerOrganizationRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      scoped.get('/', async (request) => {
        const query = listOrganizationsQuerySchema.parse(request.query)
        const { rows, nextCursor } = await app.organizationService.list(request.ctx, query)
        return {
          items: rows.map(toPublicDTO),
          nextCursor,
        }
      })

      scoped.get('/me', async (request) => {
        const org = await app.organizationService.getOwn(request.ctx)
        return toPublicDTO(org)
      })

      scoped.get('/:id', async (request) => {
        const { id } = organizationIdParamsSchema.parse(request.params)
        const org = await app.organizationService.getById(request.ctx, id)
        return toPublicDTO(org)
      })

      scoped.post('/', async (request, reply) => {
        const body = createOrganizationSchema.parse(request.body)
        const result = await app.organizationService.create(request.ctx, body, {
          ipAddress: request.ip,
        })
        reply.code(201)
        return {
          organization: toPublicDTO(result.organization),
          owner: result.owner,
        }
      })

      scoped.patch('/:id', async (request) => {
        const { id } = organizationIdParamsSchema.parse(request.params)
        const patch = updateOrganizationSchema.parse(request.body)
        const org = await app.organizationService.update(request.ctx, id, patch, {
          ipAddress: request.ip,
        })
        return toPublicDTO(org)
      })

      scoped.post('/:id/suspend', async (request) => {
        const { id } = organizationIdParamsSchema.parse(request.params)
        const org = await app.organizationService.suspend(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toPublicDTO(org)
      })

      scoped.post('/:id/activate', async (request) => {
        const { id } = organizationIdParamsSchema.parse(request.params)
        const org = await app.organizationService.activate(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toPublicDTO(org)
      })
    },
    { prefix: '/api/v1/organizations' },
  )
}

type PublicOrganizationDTO = {
  id: string
  name: string
  bin: string
  status: 'active' | 'suspended' | 'archived'
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  createdAt: string
  updatedAt: string
}

function toPublicDTO(org: import('@jumix/db').Organization): PublicOrganizationDTO {
  return {
    id: org.id,
    name: org.name,
    bin: org.bin,
    status: org.status,
    contactName: org.contactName,
    contactPhone: org.contactPhone ? maskPhone(org.contactPhone) : null,
    contactEmail: org.contactEmail,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  }
}
