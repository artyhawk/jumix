import type { AuthContext } from '@jumix/auth'
import type { CraneProfile, DatabaseClient, OrganizationOperator } from '@jumix/db'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../lib/errors'
import type { StorageClient } from '../../lib/storage/types'
import { craneProfilePolicy } from './crane-profile.policy'
import {
  type AuditMeta,
  CraneProfileRepository,
  type CraneProfileWithUser,
  type ListCraneProfileApprovalFilter,
  type MembershipWithOrganization,
} from './crane-profile.repository'
import type {
  ListCraneProfilesQuery,
  UpdateCraneProfileAdminInput,
  UpdateCraneProfileSelfInput,
} from './crane-profile.schemas'
import { type LicenseStatus, computeLicenseStatus, isLicenseValidForWork } from './license-status'

/**
 * CraneProfileService — orchestration для crane-profiles-модуля (ADR 0003 +
 * authorization.md §4.2b/§4.2c).
 *
 * Обязанности:
 *   - policy checks до I/O;
 *   - subject identification для /me ИСКЛЮЧИТЕЛЬНО из ctx.userId (§4.2a, CLAUDE.md §6 rule #10);
 *   - 404 вместо 403 для скрытия существования профиля вне scope;
 *   - ИИН conflict detection (409 IIN_ALREADY_EXISTS — global uniqueness по ADR 0003);
 *   - approval workflow (§4.2b): approve/reject только superadmin; не-pending → 409;
 *     rejected profile — read-only (update → 409);
 *   - avatar flow под canUpdateSelf: presigned PUT / confirm (prefix verify + headObject) / delete;
 *   - memberships read-only list для /me (организационные записи этого профиля).
 */

type RequestMeta = {
  ipAddress: string | null
}

const PG_UNIQUE_VIOLATION = '23505'

function isPgUniqueViolation(err: unknown): err is { code: string; constraint_name?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PG_UNIQUE_VIOLATION
  )
}

function forbidden(code: string, message: string): AppError {
  return new AppError({ statusCode: 403, code, message })
}
function profileNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: 'CRANE_PROFILE_NOT_FOUND',
    message: 'Crane profile not found',
  })
}
function conflict(code: string, message: string): AppError {
  return new AppError({ statusCode: 409, code, message })
}

const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const AVATAR_ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png'])

function extensionFor(contentType: string): string {
  return contentType === 'image/jpeg' ? 'jpg' : 'png'
}

// ТЗ §5.1.5.1: удостоверение JPG / PNG / PDF, ≤10 MB. Enforce на boundary:
//  1) presign с maxBytes (minio хедер content-length-range)
//  2) confirm HeadObject size / content-type check — последняя линия, на
//     случай если клиент обошёл content-length-range (minio S3 API strict).
const LICENSE_MAX_BYTES = 10 * 1024 * 1024
const LICENSE_ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf'])

export class CraneProfileService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly storage: StorageClient,
    private readonly logger: FastifyBaseLogger,
  ) {}

  private repoFor(ctx: AuthContext): CraneProfileRepository {
    return new CraneProfileRepository(this.database, ctx)
  }

  private resolveApprovalFilter(query: ListCraneProfilesQuery): ListCraneProfileApprovalFilter {
    return query.approvalStatus
  }

  // ---------- queries (superadmin) ----------

  async list(
    ctx: AuthContext,
    params: ListCraneProfilesQuery,
  ): Promise<{ rows: CraneProfile[]; nextCursor: string | null }> {
    if (!craneProfilePolicy.canList(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can list crane profiles')
    }
    return this.repoFor(ctx).list({
      cursor: params.cursor,
      limit: params.limit,
      search: params.search,
      approvalStatus: this.resolveApprovalFilter(params),
    })
  }

  async getById(ctx: AuthContext, id: string): Promise<CraneProfile> {
    const profile = await this.repoFor(ctx).findInScope(id)
    if (!profile) throw profileNotFound()
    return profile
  }

  // ---------- self (operator) ----------

  /**
   * GET /crane-profiles/me — operator reads own profile. Subject EXCLUSIVELY
   * из ctx.userId (§4.2a). Любой approval_status, любой deleted_at IS NULL.
   */
  async getOwn(ctx: AuthContext): Promise<CraneProfileWithUser> {
    if (ctx.role !== 'operator') {
      throw forbidden('FORBIDDEN', '/me is available to operators only')
    }
    const found = await this.repoFor(ctx).findByUserIdWithUser(ctx.userId)
    if (!found) throw profileNotFound()
    if (!craneProfilePolicy.canReadSelf(ctx, found.profile)) {
      // Belt-and-suspenders: при role='operator' и userId match тавтология,
      // но держим инвариант эксплицитным для будущих правок ctx-builder'а.
      throw profileNotFound()
    }
    return found
  }

  async updateSelf(
    ctx: AuthContext,
    patch: UpdateCraneProfileSelfInput,
    meta: RequestMeta,
  ): Promise<CraneProfileWithUser> {
    const repo = this.repoFor(ctx)
    const existingWithUser = await repo.findByUserIdWithUser(ctx.userId)
    if (!existingWithUser) throw profileNotFound()
    const existing = existingWithUser.profile

    if (!craneProfilePolicy.canUpdateSelf(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Only the owner of this profile can update it')
    }

    const updated = await repo.updateSelfFields(
      existing.id,
      {
        firstName: patch.firstName,
        lastName: patch.lastName,
        patronymic: patch.patronymic,
      },
      {
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        ipAddress: meta.ipAddress,
        metadata: { fields: Object.keys(patch) },
      },
    )
    if (!updated) throw profileNotFound()
    return { profile: updated, userPhone: existingWithUser.userPhone }
  }

  async listOwnMemberships(ctx: AuthContext): Promise<{
    profile: CraneProfile
    rows: OrganizationOperator[]
  }> {
    if (ctx.role !== 'operator') {
      throw forbidden('FORBIDDEN', '/me is available to operators only')
    }
    const repo = this.repoFor(ctx)
    const profile = await repo.findByUserId(ctx.userId)
    if (!profile) throw profileNotFound()
    const { rows } = await repo.listMembershipsForProfile(profile.id)
    return { profile, rows }
  }

  /**
   * GET /crane-profiles/me/status (ADR 0004 §/me/status) — mobile screen
   * routing. Возвращает минимально необходимое клиенту:
   *   - профиль (id / approvalStatus / rejectionReason),
   *   - membership'ы с nested organizationName (анти-N+1 JOIN),
   *   - derived `canWork` — true если профиль approved И есть хоть один
   *     approved+active hire.
   *
   * Subject EXCLUSIVELY ctx.userId (§4.2a). Operator-only.
   */
  async getMeStatus(ctx: AuthContext): Promise<{
    profile: CraneProfile
    memberships: MembershipWithOrganization[]
    licenseStatus: LicenseStatus
    canWork: boolean
  }> {
    if (ctx.role !== 'operator') {
      throw forbidden('FORBIDDEN', '/me is available to operators only')
    }
    const repo = this.repoFor(ctx)
    const profile = await repo.findByUserId(ctx.userId)
    if (!profile) throw profileNotFound()
    const { rows } = await repo.listMembershipsForProfileWithOrg(profile.id)
    const licenseStatus = computeLicenseStatus(profile.licenseExpiresAt, new Date())
    // canWork — 3-gate (ADR 0005): identity approved + ≥1 approved+active hire
    // + license либо valid, либо в одной из "expiring" градаций (ТЗ §5.1.5.1
    // блокирует только при missing/expired; предупреждения не останавливают).
    const canWork =
      profile.approvalStatus === 'approved' &&
      rows.some((m) => m.hire.approvalStatus === 'approved' && m.hire.status === 'active') &&
      isLicenseValidForWork(licenseStatus)
    return { profile, memberships: rows, licenseStatus, canWork }
  }

  // ---------- admin mutations (superadmin) ----------

  async update(
    ctx: AuthContext,
    id: string,
    patch: UpdateCraneProfileAdminInput,
    meta: RequestMeta,
  ): Promise<CraneProfile> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw profileNotFound()

    if (existing.approvalStatus === 'rejected') {
      throw conflict(
        'CRANE_PROFILE_REJECTED_READONLY',
        'Rejected crane profile is read-only (delete is allowed)',
      )
    }

    if (!craneProfilePolicy.canUpdate(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to update this crane profile')
    }

    if (patch.iin !== undefined && patch.iin !== existing.iin) {
      const iinConflict = await repo.findActiveByIin(patch.iin)
      if (iinConflict && iinConflict.id !== id) {
        throw conflict('IIN_ALREADY_EXISTS', 'Another crane profile with this IIN already exists')
      }
    }

    try {
      const updated = await repo.updateFields(
        id,
        {
          firstName: patch.firstName,
          lastName: patch.lastName,
          patronymic: patch.patronymic,
          iin: patch.iin,
          specialization: patch.specialization,
        },
        {
          actorUserId: ctx.userId,
          actorRole: ctx.role,
          ipAddress: meta.ipAddress,
          metadata: { fields: Object.keys(patch) },
        },
      )
      if (!updated) throw profileNotFound()
      return updated
    } catch (err) {
      if (
        isPgUniqueViolation(err) &&
        err.constraint_name === 'crane_profiles_iin_unique_active_idx'
      ) {
        throw conflict('IIN_ALREADY_EXISTS', 'Another crane profile with this IIN already exists')
      }
      throw err
    }
  }

  async softDelete(ctx: AuthContext, id: string, meta: RequestMeta): Promise<CraneProfile> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw profileNotFound()

    if (!craneProfilePolicy.canDelete(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can delete crane profiles')
    }

    const deleted = await repo.softDelete(id, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: { approvalStatus: existing.approvalStatus, iin: existing.iin },
    })
    if (!deleted) {
      this.logger.error(
        { id },
        'crane_profile softDelete returned null after successful findInScope',
      )
      throw profileNotFound()
    }
    return deleted
  }

  async approve(ctx: AuthContext, id: string, meta: RequestMeta): Promise<CraneProfile> {
    if (!craneProfilePolicy.canApprove(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can approve crane profiles')
    }
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw profileNotFound()

    if (existing.approvalStatus !== 'pending') {
      throw conflict(
        'CRANE_PROFILE_NOT_PENDING',
        `Crane profile is already ${existing.approvalStatus}; only pending can be approved`,
      )
    }

    const approved = await repo.approve(id, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {
        previousApprovalStatus: 'pending',
        iin: existing.iin,
        lastName: existing.lastName,
      },
    })
    if (!approved) {
      const re = await repo.findAnyById(id)
      if (re && re.approvalStatus !== 'pending') {
        throw conflict(
          'CRANE_PROFILE_NOT_PENDING',
          `Crane profile is already ${re.approvalStatus}; only pending can be approved`,
        )
      }
      this.logger.error({ id }, 'crane_profile approve returned null after pending state verified')
      throw profileNotFound()
    }
    return approved
  }

  async reject(
    ctx: AuthContext,
    id: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<CraneProfile> {
    if (!craneProfilePolicy.canReject(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can reject crane profiles')
    }
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw profileNotFound()

    if (existing.approvalStatus !== 'pending') {
      throw conflict(
        'CRANE_PROFILE_NOT_PENDING',
        `Crane profile is already ${existing.approvalStatus}; only pending can be rejected`,
      )
    }

    const rejected = await repo.reject(id, reason, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {
        previousApprovalStatus: 'pending',
        reason,
        iin: existing.iin,
        lastName: existing.lastName,
      },
    })
    if (!rejected) {
      const re = await repo.findAnyById(id)
      if (re && re.approvalStatus !== 'pending') {
        throw conflict(
          'CRANE_PROFILE_NOT_PENDING',
          `Crane profile is already ${re.approvalStatus}; only pending can be rejected`,
        )
      }
      this.logger.error({ id }, 'crane_profile reject returned null after pending state verified')
      throw profileNotFound()
    }
    return rejected
  }

  // ---------- avatar flow (self) ----------

  async requestAvatarUpload(
    ctx: AuthContext,
    contentType: string,
  ): Promise<{
    uploadUrl: string
    key: string
    headers: Record<string, string>
    expiresAt: string
  }> {
    const repo = this.repoFor(ctx)
    const found = await repo.findByUserId(ctx.userId)
    if (!found) throw profileNotFound()
    if (!craneProfilePolicy.canUpdateSelf(ctx, found)) {
      throw forbidden('FORBIDDEN', 'Only the owner of this profile can update the avatar')
    }
    if (!AVATAR_ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new AppError({
        statusCode: 400,
        code: 'AVATAR_CONTENT_TYPE_INVALID',
        message: 'Avatar content type must be image/jpeg or image/png',
      })
    }

    const { buildCraneProfileAvatarKey } = await import('../../lib/storage/object-key')
    const filename = `${Date.now()}.${extensionFor(contentType)}`
    const key = buildCraneProfileAvatarKey({
      craneProfileId: found.id,
      filename,
    })

    const { url, headers, expiresAt } = await this.storage.createPresignedPutUrl(key, {
      contentType,
      maxBytes: AVATAR_MAX_BYTES,
    })

    return { uploadUrl: url, key, headers, expiresAt: expiresAt.toISOString() }
  }

  async confirmAvatar(
    ctx: AuthContext,
    key: string,
    meta: RequestMeta,
  ): Promise<CraneProfileWithUser> {
    const repo = this.repoFor(ctx)
    const existingWithUser = await repo.findByUserIdWithUser(ctx.userId)
    if (!existingWithUser) throw profileNotFound()
    const existing = existingWithUser.profile

    if (!craneProfilePolicy.canUpdateSelf(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Only the owner of this profile can update the avatar')
    }

    const expectedPrefix = `crane-profiles/${existing.id}/avatar/`
    if (!key.startsWith(expectedPrefix)) {
      throw new AppError({
        statusCode: 400,
        code: 'STORAGE_KEY_INVALID',
        message: 'Key does not match this crane profile',
      })
    }

    const headMeta = await this.storage.headObject(key)
    if (!headMeta) {
      throw new AppError({
        statusCode: 404,
        code: 'OBJECT_NOT_FOUND',
        message: 'Uploaded avatar object not found',
      })
    }

    if (!AVATAR_ALLOWED_CONTENT_TYPES.has(headMeta.contentType)) {
      await this.safeDeleteObject(key, 'confirmAvatar content-type mismatch')
      throw new AppError({
        statusCode: 400,
        code: 'AVATAR_CONTENT_TYPE_INVALID',
        message: 'Uploaded content type is not allowed',
      })
    }

    if (headMeta.size > AVATAR_MAX_BYTES) {
      await this.safeDeleteObject(key, 'confirmAvatar size too large')
      throw new AppError({
        statusCode: 400,
        code: 'AVATAR_TOO_LARGE',
        message: 'Uploaded avatar exceeds size limit',
      })
    }

    const oldKey = existing.avatarKey
    if (oldKey && oldKey !== key) {
      await this.safeDeleteObject(oldKey, 'confirmAvatar old key cleanup')
    }

    const updated = await repo.setAvatarKey(existing.id, key, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: { key, previousKey: oldKey },
    })
    if (!updated) throw profileNotFound()
    return { profile: updated, userPhone: existingWithUser.userPhone }
  }

  async deleteAvatar(ctx: AuthContext, meta: RequestMeta): Promise<CraneProfileWithUser> {
    const repo = this.repoFor(ctx)
    const existingWithUser = await repo.findByUserIdWithUser(ctx.userId)
    if (!existingWithUser) throw profileNotFound()
    const existing = existingWithUser.profile

    if (!craneProfilePolicy.canUpdateSelf(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Only the owner of this profile can update the avatar')
    }

    if (existing.avatarKey) {
      await this.safeDeleteObject(existing.avatarKey, 'deleteAvatar')
    }

    const updated = await repo.clearAvatarKey(existing.id, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: { previousKey: existing.avatarKey },
    })
    if (!updated) throw profileNotFound()
    return { profile: updated, userPhone: existingWithUser.userPhone }
  }

  private async safeDeleteObject(key: string, context: string): Promise<void> {
    try {
      await this.storage.deleteObject(key)
    } catch (err) {
      this.logger.warn({ err, key, context }, 'avatar delete best-effort failed')
    }
  }

  // ---------- license flow (ADR 0005) ----------

  /**
   * POST /me/license/upload-url — operator requests presigned PUT для своего
   * удостоверения. Requires approvalStatus='approved' (symmetric с avatar:
   * документ ≠ identity, но пока identity не подтверждена platform'ой,
   * принимать документы преждевременно — 0004 pipeline ещё не закрылся).
   * Admin path (`requestLicenseUploadAsAdmin`) разрешает загрузку за pending.
   */
  async requestLicenseUpload(
    ctx: AuthContext,
    contentType: string,
    filename: string,
  ): Promise<{
    uploadUrl: string
    key: string
    version: number
    headers: Record<string, string>
    expiresAt: string
  }> {
    if (ctx.role !== 'operator') {
      throw forbidden('FORBIDDEN', '/me/license is operator-only; admins use /:id/license')
    }
    if (!LICENSE_ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new AppError({
        statusCode: 400,
        code: 'LICENSE_CONTENT_TYPE_INVALID',
        message: 'License content type must be image/jpeg, image/png, or application/pdf',
      })
    }
    const repo = this.repoFor(ctx)
    const profile = await repo.findByUserId(ctx.userId)
    if (!profile) throw profileNotFound()
    if (profile.approvalStatus !== 'approved') {
      throw conflict(
        'CRANE_PROFILE_NOT_APPROVED',
        'Cannot upload license until profile is approved by holding',
      )
    }
    return this.buildLicensePresign(profile.id, profile.licenseVersion, contentType, filename)
  }

  /**
   * POST /:id/license/upload-url — superadmin override (ТЗ допускает, когда
   * operator не может сам: технические сбои, ручной onboarding). Работает и
   * с pending profile — platform может выдать документ до одобрения identity
   * (обратное: approve без документа возможно по ADR 0005 — license
   * независимый от approval).
   */
  async requestLicenseUploadAsAdmin(
    ctx: AuthContext,
    craneProfileId: string,
    contentType: string,
    filename: string,
  ): Promise<{
    uploadUrl: string
    key: string
    version: number
    headers: Record<string, string>
    expiresAt: string
  }> {
    if (ctx.role !== 'superadmin') {
      throw forbidden('FORBIDDEN', 'Only superadmin can upload license for another profile')
    }
    if (!LICENSE_ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new AppError({
        statusCode: 400,
        code: 'LICENSE_CONTENT_TYPE_INVALID',
        message: 'License content type must be image/jpeg, image/png, or application/pdf',
      })
    }
    const repo = this.repoFor(ctx)
    const profile = await repo.findInScope(craneProfileId)
    if (!profile) throw profileNotFound()
    return this.buildLicensePresign(profile.id, profile.licenseVersion, contentType, filename)
  }

  async confirmLicense(
    ctx: AuthContext,
    key: string,
    expiresAt: Date,
    meta: RequestMeta,
  ): Promise<CraneProfile> {
    if (ctx.role !== 'operator') {
      throw forbidden('FORBIDDEN', '/me/license is operator-only; admins use /:id/license')
    }
    const repo = this.repoFor(ctx)
    const profile = await repo.findByUserId(ctx.userId)
    if (!profile) throw profileNotFound()
    if (profile.approvalStatus !== 'approved') {
      throw conflict(
        'CRANE_PROFILE_NOT_APPROVED',
        'Cannot upload license until profile is approved by holding',
      )
    }
    return this.finalizeLicenseConfirmation({
      ctx,
      profile,
      key,
      expiresAt,
      action: 'license.upload_self',
      meta,
    })
  }

  async confirmLicenseAsAdmin(
    ctx: AuthContext,
    craneProfileId: string,
    key: string,
    expiresAt: Date,
    meta: RequestMeta,
  ): Promise<CraneProfile> {
    if (ctx.role !== 'superadmin') {
      throw forbidden('FORBIDDEN', 'Only superadmin can confirm license for another profile')
    }
    const repo = this.repoFor(ctx)
    const profile = await repo.findInScope(craneProfileId)
    if (!profile) throw profileNotFound()
    return this.finalizeLicenseConfirmation({
      ctx,
      profile,
      key,
      expiresAt,
      action: 'license.upload_admin',
      meta,
    })
  }

  private async buildLicensePresign(
    craneProfileId: string,
    currentVersion: number,
    contentType: string,
    rawFilename: string,
  ): Promise<{
    uploadUrl: string
    key: string
    version: number
    headers: Record<string, string>
    expiresAt: string
  }> {
    const { buildCraneProfileLicenseKey } = await import('../../lib/storage/object-key')
    const nextVersion = currentVersion + 1
    const key = buildCraneProfileLicenseKey({
      craneProfileId,
      version: nextVersion,
      filename: rawFilename,
    })
    const { url, headers, expiresAt } = await this.storage.createPresignedPutUrl(key, {
      contentType,
      maxBytes: LICENSE_MAX_BYTES,
    })
    return {
      uploadUrl: url,
      key,
      version: nextVersion,
      headers,
      expiresAt: expiresAt.toISOString(),
    }
  }

  private async finalizeLicenseConfirmation(params: {
    ctx: AuthContext
    profile: CraneProfile
    key: string
    expiresAt: Date
    action: 'license.upload_self' | 'license.upload_admin'
    meta: RequestMeta
  }): Promise<CraneProfile> {
    const { ctx, profile, key, expiresAt, action, meta } = params
    const nextVersion = profile.licenseVersion + 1
    const expectedPrefix = `crane-profiles/${profile.id}/license/v${nextVersion}/`
    if (!key.startsWith(expectedPrefix)) {
      throw new AppError({
        statusCode: 400,
        code: 'LICENSE_KEY_MISMATCH',
        message: 'License key does not match profile or expected version',
      })
    }

    const head = await this.storage.headObject(key)
    if (!head) {
      throw new AppError({
        statusCode: 400,
        code: 'LICENSE_NOT_UPLOADED',
        message: 'License upload was not completed',
      })
    }
    if (!LICENSE_ALLOWED_CONTENT_TYPES.has(head.contentType)) {
      await this.safeDeleteObject(key, 'confirmLicense content-type mismatch')
      throw new AppError({
        statusCode: 400,
        code: 'LICENSE_CONTENT_TYPE_INVALID',
        message: 'Uploaded content type is not allowed',
      })
    }
    if (head.size > LICENSE_MAX_BYTES) {
      await this.safeDeleteObject(key, 'confirmLicense size too large')
      throw new AppError({
        statusCode: 400,
        code: 'LICENSE_TOO_LARGE',
        message: 'Uploaded license exceeds size limit',
      })
    }

    // Старые versions НЕ удаляем из storage (ADR 0005 — преднамеренный audit
    // trail; retention — backlog).
    const updated = await this.repoFor(ctx).updateLicense(
      {
        id: profile.id,
        licenseKey: key,
        licenseExpiresAt: expiresAt,
        licenseVersion: nextVersion,
      },
      {
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        ipAddress: meta.ipAddress,
        action,
        metadata: {
          previousVersion: profile.licenseVersion,
          expiresAt: expiresAt.toISOString(),
        },
      },
    )
    if (!updated) throw profileNotFound()
    return updated
  }
}

export type { AuditMeta }
