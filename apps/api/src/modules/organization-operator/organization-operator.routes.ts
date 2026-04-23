import { maskPhone } from '@jumix/shared'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { type LicenseStatus, computeLicenseStatus } from '../crane-profile/license-status'
import type { HydratedOrganizationOperator } from './organization-operator.repository'
import {
  blockOrganizationOperatorSchema,
  changeOrganizationOperatorStatusSchema,
  hireOrganizationOperatorSchema,
  listOrganizationOperatorsQuerySchema,
  organizationOperatorIdParamsSchema,
  rejectOrganizationOperatorSchema,
  updateOrganizationOperatorAdminSchema,
} from './organization-operator.schemas'

/**
 * Organization operators REST endpoints (ADR 0003 pipeline 2 + authorization.md §4.2b).
 *
 * Id, возвращаемые этими endpoints, — `organization_operators.id` (hire-запись).
 * Identity живёт на crane_profile, отдаётся вложенным объектом `craneProfile`
 * для list/get — это экономит N+1 запрос UI'у при показе «имя найма».
 * Phone (masked) отдаётся ТОЛЬКО в detail-эндпоинте (GET/PATCH/DELETE/:id +
 * status/approve/reject) — в списке phone не нужен.
 *
 * Admin surface:
 *   POST   /api/v1/organization-operators            hire (owner only — superadmin без org)
 *   GET    /api/v1/organization-operators            cursor-list
 *   GET    /api/v1/organization-operators/:id        read in scope
 *   PATCH  /api/v1/organization-operators/:id        update hiredAt
 *   PATCH  /api/v1/organization-operators/:id/status operational status change (generic)
 *   POST   /api/v1/organization-operators/:id/block     owner block (optional reason)
 *   POST   /api/v1/organization-operators/:id/activate  owner unblock
 *   POST   /api/v1/organization-operators/:id/terminate owner terminate (irreversible)
 *   DELETE /api/v1/organization-operators/:id        soft-delete
 *   POST   /api/v1/organization-operators/:id/approve  superadmin approve (pipeline 2)
 *   POST   /api/v1/organization-operators/:id/reject   superadmin reject c `reason`
 *
 * Все под app.authenticate. Policy/scope/tenant — в service, handler'ы только
 * парсят, мапят в DTO. `phone` из users маскируется на boundary через `maskPhone`.
 */
export const registerOrganizationOperatorRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      scoped.get('/', async (request) => {
        const query = listOrganizationOperatorsQuerySchema.parse(request.query)
        const { rows, nextCursor } = await app.organizationOperatorService.list(request.ctx, query)
        const items = await Promise.all(rows.map((row) => toPublicListDTO(app, row)))
        return { items, nextCursor }
      })

      scoped.post('/', async (request, reply) => {
        const body = hireOrganizationOperatorSchema.parse(request.body)
        const hired = await app.organizationOperatorService.hire(request.ctx, body, {
          ipAddress: request.ip,
        })
        reply.code(201)
        return await toPublicListDTO(app, hired)
      })

      scoped.get('/:id', async (request) => {
        const { id } = organizationOperatorIdParamsSchema.parse(request.params)
        const hired = await app.organizationOperatorService.getById(request.ctx, id)
        return toPublicDTO(app, hired, hired.userPhone)
      })

      scoped.patch('/:id', async (request) => {
        const { id } = organizationOperatorIdParamsSchema.parse(request.params)
        const patch = updateOrganizationOperatorAdminSchema.parse(request.body)
        const updated = await app.organizationOperatorService.update(request.ctx, id, patch, {
          ipAddress: request.ip,
        })
        return toPublicDTO(app, updated, updated.userPhone)
      })

      scoped.patch('/:id/status', async (request) => {
        const { id } = organizationOperatorIdParamsSchema.parse(request.params)
        const body = changeOrganizationOperatorStatusSchema.parse(request.body)
        const updated = await app.organizationOperatorService.changeStatus(request.ctx, id, body, {
          ipAddress: request.ip,
        })
        return toPublicDTO(app, updated, updated.userPhone)
      })

      scoped.delete('/:id', async (request) => {
        const { id } = organizationOperatorIdParamsSchema.parse(request.params)
        const deleted = await app.organizationOperatorService.softDelete(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toPublicDTO(app, deleted, deleted.userPhone)
      })

      scoped.post('/:id/block', async (request) => {
        const { id } = organizationOperatorIdParamsSchema.parse(request.params)
        const body = blockOrganizationOperatorSchema.parse(request.body ?? {})
        const updated = await app.organizationOperatorService.changeStatus(
          request.ctx,
          id,
          { status: 'blocked', reason: body.reason },
          { ipAddress: request.ip },
        )
        return toPublicDTO(app, updated, updated.userPhone)
      })

      scoped.post('/:id/activate', async (request) => {
        const { id } = organizationOperatorIdParamsSchema.parse(request.params)
        const updated = await app.organizationOperatorService.changeStatus(
          request.ctx,
          id,
          { status: 'active' },
          { ipAddress: request.ip },
        )
        return toPublicDTO(app, updated, updated.userPhone)
      })

      scoped.post('/:id/terminate', async (request) => {
        const { id } = organizationOperatorIdParamsSchema.parse(request.params)
        const updated = await app.organizationOperatorService.changeStatus(
          request.ctx,
          id,
          { status: 'terminated' },
          { ipAddress: request.ip },
        )
        return toPublicDTO(app, updated, updated.userPhone)
      })

      scoped.post('/:id/approve', async (request) => {
        const { id } = organizationOperatorIdParamsSchema.parse(request.params)
        const approved = await app.organizationOperatorService.approve(request.ctx, id, {
          ipAddress: request.ip,
        })
        return await toPublicListDTO(app, approved)
      })

      scoped.post('/:id/reject', async (request) => {
        const { id } = organizationOperatorIdParamsSchema.parse(request.params)
        const body = rejectOrganizationOperatorSchema.parse(request.body)
        const rejected = await app.organizationOperatorService.reject(
          request.ctx,
          id,
          body.reason,
          { ipAddress: request.ip },
        )
        return await toPublicListDTO(app, rejected)
      })
    },
    { prefix: '/api/v1/organization-operators' },
  )
}

type PublicCraneProfileSnippet = {
  id: string
  userId: string
  firstName: string
  lastName: string
  patronymic: string | null
  iin: string
  avatarUrl: string | null
  approvalStatus: 'pending' | 'approved' | 'rejected'
  licenseStatus: LicenseStatus
  licenseExpiresAt: string | null
}

type PublicCraneProfileSnippetWithPhone = PublicCraneProfileSnippet & {
  phone: string
}

type PublicOrganizationOperatorDTO = {
  id: string
  craneProfileId: string
  organizationId: string
  hiredAt: string | null
  terminatedAt: string | null
  status: 'active' | 'blocked' | 'terminated'
  availability: 'free' | 'busy' | 'on_shift' | null
  approvalStatus: 'pending' | 'approved' | 'rejected'
  approvedAt: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  craneProfile: PublicCraneProfileSnippetWithPhone
  createdAt: string
  updatedAt: string
}

type PublicOrganizationOperatorListItemDTO = Omit<PublicOrganizationOperatorDTO, 'craneProfile'> & {
  craneProfile: PublicCraneProfileSnippet
}

async function toPublicDTO(
  app: FastifyInstance,
  row: HydratedOrganizationOperator,
  userPhone: string,
): Promise<PublicOrganizationOperatorDTO> {
  const avatarUrl = await resolveAvatarUrl(app, row.profile.avatarKey)
  const licenseStatus = computeLicenseStatus(row.profile.licenseExpiresAt, new Date())
  return {
    id: row.hire.id,
    craneProfileId: row.hire.craneProfileId,
    organizationId: row.hire.organizationId,
    hiredAt: dateOnly(row.hire.hiredAt),
    terminatedAt: dateOnly(row.hire.terminatedAt),
    status: row.hire.status,
    availability: row.hire.availability,
    approvalStatus: row.hire.approvalStatus,
    approvedAt: row.hire.approvedAt ? row.hire.approvedAt.toISOString() : null,
    rejectedAt: row.hire.rejectedAt ? row.hire.rejectedAt.toISOString() : null,
    rejectionReason: row.hire.rejectionReason,
    craneProfile: {
      id: row.profile.id,
      userId: row.profile.userId,
      firstName: row.profile.firstName,
      lastName: row.profile.lastName,
      patronymic: row.profile.patronymic,
      iin: row.profile.iin,
      avatarUrl,
      approvalStatus: row.profile.approvalStatus,
      licenseStatus,
      licenseExpiresAt: row.profile.licenseExpiresAt
        ? dateOnly(row.profile.licenseExpiresAt)
        : null,
      phone: maskPhone(userPhone),
    },
    createdAt: row.hire.createdAt.toISOString(),
    updatedAt: row.hire.updatedAt.toISOString(),
  }
}

async function toPublicListDTO(
  app: FastifyInstance,
  row: HydratedOrganizationOperator,
): Promise<PublicOrganizationOperatorListItemDTO> {
  const avatarUrl = await resolveAvatarUrl(app, row.profile.avatarKey)
  const licenseStatus = computeLicenseStatus(row.profile.licenseExpiresAt, new Date())
  return {
    id: row.hire.id,
    craneProfileId: row.hire.craneProfileId,
    organizationId: row.hire.organizationId,
    hiredAt: dateOnly(row.hire.hiredAt),
    terminatedAt: dateOnly(row.hire.terminatedAt),
    status: row.hire.status,
    availability: row.hire.availability,
    approvalStatus: row.hire.approvalStatus,
    approvedAt: row.hire.approvedAt ? row.hire.approvedAt.toISOString() : null,
    rejectedAt: row.hire.rejectedAt ? row.hire.rejectedAt.toISOString() : null,
    rejectionReason: row.hire.rejectionReason,
    craneProfile: {
      id: row.profile.id,
      userId: row.profile.userId,
      firstName: row.profile.firstName,
      lastName: row.profile.lastName,
      patronymic: row.profile.patronymic,
      iin: row.profile.iin,
      avatarUrl,
      approvalStatus: row.profile.approvalStatus,
      licenseStatus,
      licenseExpiresAt: row.profile.licenseExpiresAt
        ? dateOnly(row.profile.licenseExpiresAt)
        : null,
    },
    createdAt: row.hire.createdAt.toISOString(),
    updatedAt: row.hire.updatedAt.toISOString(),
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
