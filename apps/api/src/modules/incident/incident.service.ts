import { randomUUID } from 'node:crypto'
import type { AuthContext } from '@jumix/auth'
import {
  type DatabaseClient,
  type Incident,
  craneProfiles,
  organizationOperators,
  shifts,
  users,
} from '@jumix/db'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../lib/errors'
import { buildPendingPhotoKey, isPendingKeyForUser } from '../../lib/storage/object-key'
import type { StorageClient } from '../../lib/storage/types'
import { incidentPolicy } from './incident.policy'
import { IncidentRepository, type IncidentWithRelations } from './incident.repository'
import type {
  CreateIncidentInput,
  EscalateIncidentInput,
  ListMyQuery,
  ListOrgQuery,
  RequestPhotoUploadUrlInput,
  ResolveIncidentInput,
} from './incident.schemas'

const PHOTO_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const PHOTO_ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

export type RequestMeta = { ipAddress: string | null }

function forbidden(code: string, message: string): AppError {
  return new AppError({ statusCode: 403, code, message })
}
function notFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: 'INCIDENT_NOT_FOUND',
    message: 'Incident not found',
  })
}
function conflict(code: string, message: string): AppError {
  return new AppError({ statusCode: 409, code, message })
}
function unprocessable(code: string, message: string, details?: Record<string, unknown>): AppError {
  return new AppError({ statusCode: 422, code, message, details })
}
function badRequest(code: string, message: string): AppError {
  return new AppError({ statusCode: 400, code, message })
}

export class IncidentService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly storage: StorageClient,
    private readonly logger: FastifyBaseLogger,
  ) {}

  private repoFor(ctx: AuthContext): IncidentRepository {
    return new IncidentRepository(this.database, ctx)
  }

  /**
   * Presigned PUT для photo upload. Operator только. Key — pending-prefix
   * scoped по userId; service на confirm проверит ownership.
   */
  async requestPhotoUploadUrl(
    ctx: AuthContext,
    input: RequestPhotoUploadUrlInput,
  ): Promise<{
    uploadUrl: string
    key: string
    headers: Record<string, string>
    expiresAt: string
  }> {
    if (ctx.role !== 'operator') {
      throw forbidden('FORBIDDEN', 'Only operator can upload incident photos')
    }
    if (!PHOTO_ALLOWED_CONTENT_TYPES.has(input.contentType.toLowerCase())) {
      throw badRequest('PHOTO_CONTENT_TYPE_INVALID', 'Unsupported image content type')
    }
    const key = buildPendingPhotoKey({
      userId: ctx.userId,
      uniqueId: randomUUID(),
      filename: input.filename,
    })
    const presigned = await this.storage.createPresignedPutUrl(key, {
      contentType: input.contentType,
      maxBytes: PHOTO_MAX_BYTES,
    })
    return {
      uploadUrl: presigned.url,
      key,
      headers: presigned.headers,
      expiresAt: presigned.expiresAt.toISOString(),
    }
  }

  /**
   * Создание incident. Operator only. Если shiftId передан — site/crane/
   * organization derive'ятся из shift (validated, должен быть own active).
   * Иначе — organization из user.organization_id (для operator without active
   * shift это может быть null → должен быть hire с org).
   */
  async create(
    ctx: AuthContext,
    input: CreateIncidentInput,
    meta: RequestMeta,
  ): Promise<IncidentWithRelations> {
    if (!incidentPolicy.canCreate(ctx)) {
      throw forbidden('FORBIDDEN', 'Only operator can create incidents')
    }

    // Validate photo keys принадлежат этому operator'у
    for (const key of input.photoKeys) {
      if (!isPendingKeyForUser(key, ctx.userId)) {
        throw badRequest('PHOTO_KEY_NOT_OWNED', 'Photo key does not belong to current user')
      }
    }

    // HEAD каждого фото — confirm что upload действительно произошёл и
    // content-type соответствует. Невалидные → reject (operator повторит upload).
    for (const key of input.photoKeys) {
      const head = await this.storage.headObject(key)
      if (!head) {
        throw badRequest('PHOTO_NOT_UPLOADED', `Photo ${key} was not uploaded`)
      }
      if (!PHOTO_ALLOWED_CONTENT_TYPES.has(head.contentType.toLowerCase())) {
        await this.safeDelete(key, 'create incident: bad content-type')
        throw badRequest('PHOTO_CONTENT_TYPE_INVALID', `Photo ${key} has invalid content type`)
      }
      if (head.size > PHOTO_MAX_BYTES) {
        await this.safeDelete(key, 'create incident: too large')
        throw badRequest('PHOTO_TOO_LARGE', `Photo ${key} exceeds size limit`)
      }
    }

    // Reporter info — fresh из users + crane_profile (operator's full name).
    // user.name — display name (может быть phone-based для freshly registered);
    // crane_profile.{firstName,lastName,patronymic} — структурированные данные,
    // используем их если профиль есть.
    const userRow = (
      await this.database.db
        .select({
          id: users.id,
          name: users.name,
          phone: users.phone,
          organizationId: users.organizationId,
        })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1)
    )[0]
    if (!userRow) throw forbidden('FORBIDDEN', 'Reporter not found')

    const profileRow = (
      await this.database.db
        .select({
          firstName: craneProfiles.firstName,
          lastName: craneProfiles.lastName,
          patronymic: craneProfiles.patronymic,
        })
        .from(craneProfiles)
        .where(eq(craneProfiles.userId, ctx.userId))
        .limit(1)
    )[0]

    // Derive shift/site/crane/organization
    let shiftId: string | null = null
    let siteId: string | null = null
    let craneId: string | null = null
    let organizationId: string | null = null

    if (input.shiftId) {
      const shiftRow = (
        await this.database.db
          .select({
            id: shifts.id,
            operatorId: shifts.operatorId,
            organizationId: shifts.organizationId,
            siteId: shifts.siteId,
            craneId: shifts.craneId,
            status: shifts.status,
          })
          .from(shifts)
          .where(and(eq(shifts.id, input.shiftId), eq(shifts.operatorId, ctx.userId)))
          .limit(1)
      )[0]
      if (!shiftRow) {
        throw badRequest('SHIFT_NOT_FOUND', 'Shift not found or not owned')
      }
      shiftId = shiftRow.id
      siteId = shiftRow.siteId
      craneId = shiftRow.craneId
      organizationId = shiftRow.organizationId
    } else {
      // Без shift — derive organization из active hire. ADR 0003: operator'ы
      // public registration → users.organization_id = null, primary org
      // живёт через organization_operators. Берём первый approved+active hire
      // (backlog: explicit X-Organization-Id header при multi-org operator'е).
      organizationId = userRow.organizationId
      if (!organizationId && profileRow) {
        const hireRow = (
          await this.database.db
            .select({ organizationId: organizationOperators.organizationId })
            .from(organizationOperators)
            .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
            .where(
              and(
                eq(craneProfiles.userId, ctx.userId),
                eq(organizationOperators.approvalStatus, 'approved'),
                eq(organizationOperators.status, 'active'),
                isNull(organizationOperators.deletedAt),
              ),
            )
            .limit(1)
        )[0]
        organizationId = hireRow?.organizationId ?? null
      }
      if (!organizationId) {
        throw unprocessable(
          'NO_ORGANIZATION_CONTEXT',
          'Cannot report incident without organization context (use active shift or have approved hire)',
        )
      }
    }

    const repo = this.repoFor(ctx)
    const reporterName = profileRow
      ? [profileRow.lastName, profileRow.firstName, profileRow.patronymic]
          .filter(Boolean)
          .join(' ')
          .trim()
      : userRow.name

    let created: Incident
    try {
      created = await repo.create(
        {
          reporterUserId: ctx.userId,
          reporterName,
          reporterPhone: userRow.phone,
          organizationId,
          shiftId,
          siteId,
          craneId,
          type: input.type,
          severity: input.severity,
          description: input.description,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          photoKeys: input.photoKeys,
        },
        {
          actorUserId: ctx.userId,
          actorRole: ctx.role,
          ipAddress: meta.ipAddress,
          metadata: {
            type: input.type,
            severity: input.severity,
            shiftId,
            photoCount: input.photoKeys.length,
          },
        },
      )
    } catch (err) {
      this.logger.error({ err }, 'incident create failed')
      throw err
    }

    const result = await repo.findInScope(created.id)
    if (!result) {
      throw new AppError({
        statusCode: 500,
        code: 'INCIDENT_CREATE_HYDRATE_FAILED',
        message: 'Created incident lookup returned empty',
      })
    }
    return result
  }

  async listMy(
    ctx: AuthContext,
    query: ListMyQuery,
  ): Promise<{ rows: IncidentWithRelations[]; nextCursor: string | null }> {
    if (!incidentPolicy.canListMy(ctx)) {
      throw forbidden('FORBIDDEN', 'Only operator can list own incidents')
    }
    return this.repoFor(ctx).listMy(ctx.userId, {
      cursor: query.cursor,
      limit: query.limit,
    })
  }

  async listOrg(
    ctx: AuthContext,
    query: ListOrgQuery,
  ): Promise<{ rows: IncidentWithRelations[]; nextCursor: string | null }> {
    if (!incidentPolicy.canListOrg(ctx)) {
      throw forbidden('FORBIDDEN', 'Only owner/superadmin can list org incidents')
    }
    return this.repoFor(ctx).listForOrg({
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
      severity: query.severity,
      type: query.type,
      siteId: query.siteId,
      craneId: query.craneId,
    })
  }

  async getById(
    ctx: AuthContext,
    id: string,
  ): Promise<IncidentWithRelations & { photoUrls: Record<string, string> }> {
    const found = await this.repoFor(ctx).findInScope(id)
    if (!found) throw notFound()
    return this.attachPresignedUrls(found)
  }

  async acknowledge(
    ctx: AuthContext,
    id: string,
    meta: RequestMeta,
  ): Promise<IncidentWithRelations> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw notFound()
    if (!incidentPolicy.canAcknowledge(ctx, existing.incident)) {
      throw conflict(
        'INVALID_INCIDENT_TRANSITION',
        `Cannot acknowledge incident in ${existing.incident.status}`,
      )
    }
    const updated = await repo.acknowledge(id, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {},
    })
    if (!updated) {
      throw conflict('INVALID_INCIDENT_TRANSITION', 'Incident state changed concurrently')
    }
    const result = await repo.findInScope(id)
    if (!result) throw notFound()
    return result
  }

  async resolve(
    ctx: AuthContext,
    id: string,
    input: ResolveIncidentInput,
    meta: RequestMeta,
  ): Promise<IncidentWithRelations> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw notFound()
    if (!incidentPolicy.canResolve(ctx, existing.incident)) {
      throw conflict(
        'INVALID_INCIDENT_TRANSITION',
        `Cannot resolve incident in ${existing.incident.status}`,
      )
    }
    const updated = await repo.resolve(id, input.notes ?? null, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: { hadNotes: Boolean(input.notes) },
    })
    if (!updated) {
      throw conflict('INVALID_INCIDENT_TRANSITION', 'Incident state changed concurrently')
    }
    const result = await repo.findInScope(id)
    if (!result) throw notFound()
    return result
  }

  async escalate(
    ctx: AuthContext,
    id: string,
    input: EscalateIncidentInput,
    meta: RequestMeta,
  ): Promise<IncidentWithRelations> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw notFound()
    if (!incidentPolicy.canEscalate(ctx, existing.incident)) {
      throw conflict(
        'INVALID_INCIDENT_TRANSITION',
        `Cannot escalate incident in ${existing.incident.status}`,
      )
    }
    const updated = await repo.escalate(id, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: { hadNotes: Boolean(input.notes) },
    })
    if (!updated) {
      throw conflict('INVALID_INCIDENT_TRANSITION', 'Incident state changed concurrently')
    }
    const result = await repo.findInScope(id)
    if (!result) throw notFound()
    return result
  }

  async deEscalate(
    ctx: AuthContext,
    id: string,
    meta: RequestMeta,
  ): Promise<IncidentWithRelations> {
    // Superadmin only — но findInScope для superadmin даёт всё.
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw notFound()
    if (!incidentPolicy.canDeEscalate(ctx, existing.incident)) {
      throw conflict(
        'INVALID_INCIDENT_TRANSITION',
        `Cannot de-escalate incident in ${existing.incident.status}`,
      )
    }
    const updated = await repo.deEscalate(id, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {},
    })
    if (!updated) {
      throw conflict('INVALID_INCIDENT_TRANSITION', 'Incident state changed concurrently')
    }
    const result = await repo.findInScope(id)
    if (!result) throw notFound()
    return result
  }

  /** Attach presigned GET URLs (15 min) на photos для detail view. */
  async attachPresignedUrls(
    item: IncidentWithRelations,
  ): Promise<IncidentWithRelations & { photoUrls: Record<string, string> }> {
    const photoUrls: Record<string, string> = {}
    for (const p of item.photos) {
      try {
        const presigned = await this.storage.createPresignedGetUrl(p.storageKey, {})
        photoUrls[p.id] = presigned.url
      } catch (err) {
        this.logger.warn({ err, key: p.storageKey }, 'failed to presign incident photo URL')
      }
    }
    return { ...item, photoUrls }
  }

  private async safeDelete(key: string, reason: string): Promise<void> {
    try {
      await this.storage.deleteObject(key)
    } catch (err) {
      this.logger.warn({ err, key, reason }, 'failed to delete invalid photo object')
    }
  }
}
