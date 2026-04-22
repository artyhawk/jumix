import type { CraneProfile, OrganizationOperator } from '@jumix/db'
import { maskPhone } from '@jumix/shared'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { MembershipWithOrganization } from './crane-profile.repository'
import {
  avatarUploadUrlRequestSchema,
  confirmAvatarSchema,
  craneProfileIdParamsSchema,
  listCraneProfilesQuerySchema,
  rejectCraneProfileSchema,
  updateCraneProfileAdminSchema,
  updateCraneProfileSelfSchema,
} from './crane-profile.schemas'

/**
 * Crane profiles REST endpoints (ADR 0003 + authorization.md §4.2c).
 *
 * Superadmin (identity pool — pipeline 1):
 *   GET    /api/v1/crane-profiles                 list с approval-filter'ом
 *   GET    /api/v1/crane-profiles/:id             read
 *   PATCH  /api/v1/crane-profiles/:id             update identity (не approval!)
 *   DELETE /api/v1/crane-profiles/:id             soft-delete
 *   POST   /api/v1/crane-profiles/:id/approve     approval-pipeline 1
 *   POST   /api/v1/crane-profiles/:id/reject      с обязательным `reason`
 *
 * Self (operator, субъект ЭКСКЛЮЗИВНО ctx.userId — §4.2a):
 *   GET    /api/v1/crane-profiles/me              own profile (любой status)
 *   PATCH  /api/v1/crane-profiles/me              whitelist ФИО
 *   GET    /api/v1/crane-profiles/me/memberships  список найма этого профиля
 *   GET    /api/v1/crane-profiles/me/status       screen routing (ADR 0004):
 *                                                  profile+memberships+canWork
 *   POST   /api/v1/crane-profiles/me/avatar/upload-url
 *   POST   /api/v1/crane-profiles/me/avatar/confirm
 *   DELETE /api/v1/crane-profiles/me/avatar
 */
export const registerCraneProfileRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      // -------- self endpoints: регистрируются ДО :id чтобы не коллидировать --------

      scoped.get('/me', async (request) => {
        const { profile, userPhone } = await app.craneProfileService.getOwn(request.ctx)
        return toPublicDTO(app, profile, userPhone)
      })

      scoped.patch('/me', async (request) => {
        const patch = updateCraneProfileSelfSchema.parse(request.body)
        const { profile, userPhone } = await app.craneProfileService.updateSelf(
          request.ctx,
          patch,
          { ipAddress: request.ip },
        )
        return toPublicDTO(app, profile, userPhone)
      })

      scoped.get('/me/memberships', async (request) => {
        const { rows } = await app.craneProfileService.listOwnMemberships(request.ctx)
        return { items: rows.map(toMembershipDTO) }
      })

      scoped.get('/me/status', async (request) => {
        const { profile, memberships, canWork } = await app.craneProfileService.getMeStatus(
          request.ctx,
        )
        return {
          profile: {
            id: profile.id,
            approvalStatus: profile.approvalStatus,
            rejectionReason: profile.rejectionReason,
          },
          memberships: memberships.map(toMembershipStatusDTO),
          canWork,
        }
      })

      scoped.post('/me/avatar/upload-url', async (request) => {
        const body = avatarUploadUrlRequestSchema.parse(request.body)
        return app.craneProfileService.requestAvatarUpload(request.ctx, body.contentType)
      })

      scoped.post('/me/avatar/confirm', async (request) => {
        const body = confirmAvatarSchema.parse(request.body)
        const { profile, userPhone } = await app.craneProfileService.confirmAvatar(
          request.ctx,
          body.key,
          { ipAddress: request.ip },
        )
        return toPublicDTO(app, profile, userPhone)
      })

      scoped.delete('/me/avatar', async (request) => {
        const { profile, userPhone } = await app.craneProfileService.deleteAvatar(request.ctx, {
          ipAddress: request.ip,
        })
        return toPublicDTO(app, profile, userPhone)
      })

      // -------- admin endpoints (superadmin) --------

      scoped.get('/', async (request) => {
        const query = listCraneProfilesQuerySchema.parse(request.query)
        const { rows, nextCursor } = await app.craneProfileService.list(request.ctx, query)
        const items = await Promise.all(rows.map((p) => toPublicListDTO(app, p)))
        return { items, nextCursor }
      })

      scoped.get('/:id', async (request) => {
        const { id } = craneProfileIdParamsSchema.parse(request.params)
        const profile = await app.craneProfileService.getById(request.ctx, id)
        return toPublicListDTO(app, profile)
      })

      scoped.patch('/:id', async (request) => {
        const { id } = craneProfileIdParamsSchema.parse(request.params)
        const patch = updateCraneProfileAdminSchema.parse(request.body)
        const profile = await app.craneProfileService.update(request.ctx, id, patch, {
          ipAddress: request.ip,
        })
        return toPublicListDTO(app, profile)
      })

      scoped.delete('/:id', async (request) => {
        const { id } = craneProfileIdParamsSchema.parse(request.params)
        const profile = await app.craneProfileService.softDelete(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toPublicListDTO(app, profile)
      })

      scoped.post('/:id/approve', async (request) => {
        const { id } = craneProfileIdParamsSchema.parse(request.params)
        const profile = await app.craneProfileService.approve(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toPublicListDTO(app, profile)
      })

      scoped.post('/:id/reject', async (request) => {
        const { id } = craneProfileIdParamsSchema.parse(request.params)
        const body = rejectCraneProfileSchema.parse(request.body)
        const profile = await app.craneProfileService.reject(request.ctx, id, body.reason, {
          ipAddress: request.ip,
        })
        return toPublicListDTO(app, profile)
      })
    },
    { prefix: '/api/v1/crane-profiles' },
  )
}

type PublicCraneProfileDTO = {
  id: string
  userId: string
  firstName: string
  lastName: string
  patronymic: string | null
  iin: string
  phone: string
  avatarUrl: string | null
  specialization: Record<string, unknown>
  approvalStatus: 'pending' | 'approved' | 'rejected'
  approvedAt: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
}

type PublicCraneProfileListItemDTO = Omit<PublicCraneProfileDTO, 'phone'>

type PublicMembershipDTO = {
  id: string
  organizationId: string
  hiredAt: string | null
  terminatedAt: string | null
  status: 'active' | 'blocked' | 'terminated'
  availability: 'free' | 'busy' | 'on_shift' | null
  approvalStatus: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
}

async function toPublicDTO(
  app: FastifyInstance,
  profile: CraneProfile,
  userPhone: string,
): Promise<PublicCraneProfileDTO> {
  const avatarUrl = await resolveAvatarUrl(app, profile.avatarKey)
  return {
    id: profile.id,
    userId: profile.userId,
    firstName: profile.firstName,
    lastName: profile.lastName,
    patronymic: profile.patronymic,
    iin: profile.iin,
    phone: maskPhone(userPhone),
    avatarUrl,
    specialization: profile.specialization,
    approvalStatus: profile.approvalStatus,
    approvedAt: profile.approvedAt ? profile.approvedAt.toISOString() : null,
    rejectedAt: profile.rejectedAt ? profile.rejectedAt.toISOString() : null,
    rejectionReason: profile.rejectionReason,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  }
}

async function toPublicListDTO(
  app: FastifyInstance,
  profile: CraneProfile,
): Promise<PublicCraneProfileListItemDTO> {
  const avatarUrl = await resolveAvatarUrl(app, profile.avatarKey)
  return {
    id: profile.id,
    userId: profile.userId,
    firstName: profile.firstName,
    lastName: profile.lastName,
    patronymic: profile.patronymic,
    iin: profile.iin,
    avatarUrl,
    specialization: profile.specialization,
    approvalStatus: profile.approvalStatus,
    approvedAt: profile.approvedAt ? profile.approvedAt.toISOString() : null,
    rejectedAt: profile.rejectedAt ? profile.rejectedAt.toISOString() : null,
    rejectionReason: profile.rejectionReason,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  }
}

function toMembershipDTO(row: OrganizationOperator): PublicMembershipDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    hiredAt: dateOnly(row.hiredAt),
    terminatedAt: dateOnly(row.terminatedAt),
    status: row.status,
    availability: row.availability,
    approvalStatus: row.approvalStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

type MeStatusMembershipDTO = {
  id: string
  organizationId: string
  organizationName: string
  approvalStatus: 'pending' | 'approved' | 'rejected'
  status: 'active' | 'blocked' | 'terminated'
}

function toMembershipStatusDTO(row: MembershipWithOrganization): MeStatusMembershipDTO {
  return {
    id: row.hire.id,
    organizationId: row.hire.organizationId,
    organizationName: row.organizationName,
    approvalStatus: row.hire.approvalStatus,
    status: row.hire.status,
  }
}

async function resolveAvatarUrl(
  app: FastifyInstance,
  avatarKey: string | null,
): Promise<string | null> {
  if (!avatarKey) return null
  const { url } = await app.storage.createPresignedGetUrl(avatarKey)
  return url
}

function dateOnly(value: Date | string | null): string | null {
  if (value === null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value
}
