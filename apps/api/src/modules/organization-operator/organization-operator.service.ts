import type { AuthContext } from '@jumix/auth'
import type { DatabaseClient, OperatorStatus, OrganizationOperator } from '@jumix/db'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../lib/errors'
import { organizationOperatorPolicy } from './organization-operator.policy'
import {
  type AuditMeta,
  type HydratedOrganizationOperator,
  type HydratedOrganizationOperatorWithUser,
  OrganizationOperatorRepository,
} from './organization-operator.repository'
import type {
  ChangeOrganizationOperatorStatusInput,
  HireOrganizationOperatorInput,
  ListOrganizationOperatorsQuery,
  UpdateOrganizationOperatorAdminInput,
} from './organization-operator.schemas'

/**
 * OrganizationOperatorService — orchestration для hire-workflow'а холдинга
 * (ADR 0003 pipeline 2 + authorization.md §4.2b).
 *
 * Обязанности:
 *   - policy checks (organizationOperatorPolicy) до I/O;
 *   - 404 вместо 403 для скрытия существования найма вне scope (CLAUDE.md §4.3);
 *   - approval workflow (§4.2b):
 *       * hire() → создаёт pending organization_operator. Pre-checks:
 *         crane_profile live + approved + не занят активным hire'ом в этой же
 *         org (UNIQUE(craneProfileId, organizationId) WHERE deleted_at IS NULL).
 *       * approve/reject — только superadmin, только pending. Не-pending → 409
 *         ORGANIZATION_OPERATOR_NOT_PENDING. Rejected + update → 409
 *         ORGANIZATION_OPERATOR_REJECTED_READONLY. Rejected + delete — ok.
 *       * changeStatus + update требуют approval_status='approved'; pending →
 *         409 ORGANIZATION_OPERATOR_NOT_APPROVED.
 *   - terminated_at semantics (см. JSDoc `changeStatus` + `computeTerminatedAt`):
 *     исторический факт сохраняется при восстановлении.
 *
 * Singleton. Per-call repository с ctx из request.
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
function hireNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: 'ORGANIZATION_OPERATOR_NOT_FOUND',
    message: 'Organization operator not found',
  })
}
function conflict(code: string, message: string): AppError {
  return new AppError({ statusCode: 409, code, message })
}

export class OrganizationOperatorService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly logger: FastifyBaseLogger,
  ) {}

  private repoFor(ctx: AuthContext): OrganizationOperatorRepository {
    return new OrganizationOperatorRepository(this.database, ctx)
  }

  // ---------- queries ----------

  async list(
    ctx: AuthContext,
    params: ListOrganizationOperatorsQuery,
  ): Promise<{ rows: HydratedOrganizationOperator[]; nextCursor: string | null }> {
    if (!organizationOperatorPolicy.canList(ctx)) {
      throw forbidden('FORBIDDEN', 'Operators cannot list organization operators')
    }
    return this.repoFor(ctx).list({
      cursor: params.cursor,
      limit: params.limit,
      search: params.search,
      status: params.status,
      approvalStatus: params.approvalStatus,
      craneProfileId: params.craneProfileId,
      // Owner scope жёстко через ctx внутри repo.list — organizationId
      // передаётся только для superadmin'овского narrow-down'а.
      organizationId: ctx.role === 'superadmin' ? params.organizationId : undefined,
    })
  }

  async getById(ctx: AuthContext, id: string): Promise<HydratedOrganizationOperatorWithUser> {
    const found = await this.repoFor(ctx).findInScopeWithUser(id)
    if (!found) throw hireNotFound()
    return found
  }

  // ---------- admin mutations ----------

  /**
   * Owner hires existing approved crane_profile. Pre-checks в service'е
   * (user-facing 409), FK + partial UNIQUE страхуют race-condition.
   */
  async hire(
    ctx: AuthContext,
    input: HireOrganizationOperatorInput,
    meta: RequestMeta,
  ): Promise<HydratedOrganizationOperator> {
    if (!organizationOperatorPolicy.canCreate(ctx) || ctx.role !== 'owner') {
      throw forbidden('FORBIDDEN', 'Only owner can hire organization operators')
    }
    const organizationId = ctx.organizationId
    const repo = this.repoFor(ctx)

    // Pre-check profile: должен быть живой и approved на уровне платформы.
    const profile = await repo.findCraneProfileForHire(input.craneProfileId)
    if (!profile) {
      throw new AppError({
        statusCode: 404,
        code: 'CRANE_PROFILE_NOT_FOUND',
        message: 'Crane profile not found',
      })
    }
    if (profile.approvalStatus !== 'approved') {
      throw conflict(
        'CRANE_PROFILE_NOT_APPROVED',
        `Crane profile is ${profile.approvalStatus}; only approved profiles can be hired`,
      )
    }

    // Pre-check membership conflict (partial UNIQUE среди живых hire'ов).
    const existingHire = await repo.findActiveByProfileAndOrg(input.craneProfileId, organizationId)
    if (existingHire) {
      throw conflict(
        'ALREADY_MEMBER',
        'This crane profile already has an active hire in this organization',
      )
    }

    try {
      const hired = await repo.hire(
        {
          craneProfileId: input.craneProfileId,
          organizationId,
          hiredAt: input.hiredAt ?? null,
        },
        {
          actorUserId: ctx.userId,
          actorRole: ctx.role,
          ipAddress: meta.ipAddress,
          metadata: {
            craneProfileId: input.craneProfileId,
            iin: profile.iin,
            lastName: profile.lastName,
          },
        },
      )
      if (!hired) {
        // Race: профиль удалили между pre-check и insert'ом.
        throw new AppError({
          statusCode: 404,
          code: 'CRANE_PROFILE_NOT_FOUND',
          message: 'Crane profile not found',
        })
      }
      return hired
    } catch (err) {
      if (
        isPgUniqueViolation(err) &&
        err.constraint_name === 'organization_operators_profile_org_unique_active_idx'
      ) {
        throw conflict(
          'ALREADY_MEMBER',
          'This crane profile already has an active hire in this organization',
        )
      }
      this.logger.error({ err }, 'hire organization_operator unexpected error')
      throw err
    }
  }

  async update(
    ctx: AuthContext,
    id: string,
    patch: UpdateOrganizationOperatorAdminInput,
    meta: RequestMeta,
  ): Promise<HydratedOrganizationOperatorWithUser> {
    const repo = this.repoFor(ctx)
    const existingWithUser = await repo.findInScopeWithUser(id)
    if (!existingWithUser) throw hireNotFound()
    const existing = existingWithUser.hire

    if (existing.approvalStatus === 'rejected') {
      throw conflict(
        'ORGANIZATION_OPERATOR_REJECTED_READONLY',
        'Rejected organization operator is read-only (delete is allowed)',
      )
    }
    if (existing.approvalStatus === 'pending') {
      throw conflict(
        'ORGANIZATION_OPERATOR_NOT_APPROVED',
        'Organization operator must be approved by holding before updates',
      )
    }

    if (!organizationOperatorPolicy.canUpdate(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to update this organization operator')
    }

    const updated = await repo.updateFields(
      id,
      existing.organizationId,
      { hiredAt: patch.hiredAt },
      {
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        ipAddress: meta.ipAddress,
        metadata: { fields: Object.keys(patch) },
      },
    )
    if (!updated) throw hireNotFound()
    return { ...updated, userPhone: existingWithUser.userPhone }
  }

  /**
   * changeStatus. Approval-gate: только approved.
   *
   * Логика terminated_at:
   *   - если current.status === next (идемпотентность) — no-op, возвращаем как
   *     есть, НЕ пишем audit, НЕ трогаем terminated_at.
   *   - иначе: новое значение решается `computeTerminatedAt`:
   *       * next='terminated' → new Date() (первое или повторное увольнение)
   *       * next ∈ {'active','blocked'} → current.terminatedAt (сохраняем
   *         исторический факт при восстановлении; null — если никогда не увольняли).
   */
  async changeStatus(
    ctx: AuthContext,
    id: string,
    input: ChangeOrganizationOperatorStatusInput,
    meta: RequestMeta,
  ): Promise<HydratedOrganizationOperatorWithUser> {
    const repo = this.repoFor(ctx)
    const existingWithUser = await repo.findInScopeWithUser(id)
    if (!existingWithUser) throw hireNotFound()
    const existing = existingWithUser.hire

    if (existing.approvalStatus === 'pending') {
      throw conflict(
        'ORGANIZATION_OPERATOR_NOT_APPROVED',
        'Organization operator must be approved by holding before operational status changes',
      )
    }
    if (existing.approvalStatus === 'rejected') {
      throw conflict(
        'ORGANIZATION_OPERATOR_REJECTED_READONLY',
        'Rejected organization operator is read-only (delete is allowed)',
      )
    }

    if (!organizationOperatorPolicy.canChangeStatus(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to change status of this organization operator')
    }

    if (existing.status === input.status) {
      return existingWithUser
    }

    const terminatedAt = computeTerminatedAt(existing, input.status)

    const updated = await repo.setStatus(id, existing.organizationId, input.status, terminatedAt, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {
        from: existing.status,
        to: input.status,
        reason: input.reason ?? null,
      },
    })
    if (!updated) {
      this.logger.error(
        { id },
        'organization_operator setStatus returned null after successful findInScope',
      )
      throw hireNotFound()
    }
    return { ...updated, userPhone: existingWithUser.userPhone }
  }

  async softDelete(
    ctx: AuthContext,
    id: string,
    meta: RequestMeta,
  ): Promise<HydratedOrganizationOperatorWithUser> {
    const repo = this.repoFor(ctx)
    const existingWithUser = await repo.findInScopeWithUser(id)
    if (!existingWithUser) throw hireNotFound()
    const existing = existingWithUser.hire

    if (!organizationOperatorPolicy.canDelete(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to delete this organization operator')
    }

    const deleted = await repo.softDelete(id, existing.organizationId, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {
        status: existing.status,
        approvalStatus: existing.approvalStatus,
        craneProfileId: existing.craneProfileId,
      },
    })
    if (!deleted) {
      this.logger.error(
        { id },
        'organization_operator softDelete returned null after successful findInScope',
      )
      throw hireNotFound()
    }
    return { ...deleted, userPhone: existingWithUser.userPhone }
  }

  async approve(
    ctx: AuthContext,
    id: string,
    meta: RequestMeta,
  ): Promise<HydratedOrganizationOperator> {
    if (!organizationOperatorPolicy.canApprove(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can approve organization operators')
    }

    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw hireNotFound()

    if (existing.hire.approvalStatus !== 'pending') {
      throw conflict(
        'ORGANIZATION_OPERATOR_NOT_PENDING',
        `Organization operator is already ${existing.hire.approvalStatus}; only pending can be approved`,
      )
    }

    const approved = await repo.approve(id, existing.hire.organizationId, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {
        previousApprovalStatus: 'pending',
        craneProfileId: existing.hire.craneProfileId,
        iin: existing.profile.iin,
        lastName: existing.profile.lastName,
      },
    })
    if (!approved) {
      const re = await repo.findAnyById(id)
      if (re && re.hire.approvalStatus !== 'pending') {
        throw conflict(
          'ORGANIZATION_OPERATOR_NOT_PENDING',
          `Organization operator is already ${re.hire.approvalStatus}; only pending can be approved`,
        )
      }
      this.logger.error(
        { id },
        'organization_operator approve returned null after pending state verified',
      )
      throw hireNotFound()
    }
    return approved
  }

  async reject(
    ctx: AuthContext,
    id: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<HydratedOrganizationOperator> {
    if (!organizationOperatorPolicy.canReject(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can reject organization operators')
    }

    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw hireNotFound()

    if (existing.hire.approvalStatus !== 'pending') {
      throw conflict(
        'ORGANIZATION_OPERATOR_NOT_PENDING',
        `Organization operator is already ${existing.hire.approvalStatus}; only pending can be rejected`,
      )
    }

    const rejected = await repo.reject(id, existing.hire.organizationId, reason, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {
        previousApprovalStatus: 'pending',
        reason,
        craneProfileId: existing.hire.craneProfileId,
        iin: existing.profile.iin,
        lastName: existing.profile.lastName,
      },
    })
    if (!rejected) {
      const re = await repo.findAnyById(id)
      if (re && re.hire.approvalStatus !== 'pending') {
        throw conflict(
          'ORGANIZATION_OPERATOR_NOT_PENDING',
          `Organization operator is already ${re.hire.approvalStatus}; only pending can be rejected`,
        )
      }
      this.logger.error(
        { id },
        'organization_operator reject returned null after pending state verified',
      )
      throw hireNotFound()
    }
    return rejected
  }
}

function computeTerminatedAt(
  current: Pick<OrganizationOperator, 'status' | 'terminatedAt'>,
  next: OperatorStatus,
): Date | null {
  if (next === 'terminated') {
    return new Date()
  }
  return current.terminatedAt
}

export type { AuditMeta }
