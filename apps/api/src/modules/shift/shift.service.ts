import type { AuthContext } from '@jumix/auth'
import {
  type Crane,
  type CraneProfile,
  type DatabaseClient,
  craneProfiles,
  cranes,
  organizationOperators,
} from '@jumix/db'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../lib/errors'
import type { CraneProfileService } from '../crane-profile/crane-profile.service'
import { shiftPolicy } from './shift.policy'
import { type AvailableCrane, ShiftRepository, type ShiftWithRelations } from './shift.repository'
import type {
  EndShiftInput,
  ListMyShiftsQuery,
  ListOwnerShiftsQuery,
  StartShiftInput,
} from './shift.schemas'

/**
 * ShiftService — orchestration для shifts-модуля (M4, ADR 0006).
 *
 * Ответственность:
 *   - policy checks (shiftPolicy) до I/O;
 *   - canWork enforcement (3-gate из crane-profile.service.computeCanWork):
 *     profile approved ∧ hire approved+active ∧ license valid — блокирует start;
 *   - crane eligibility: cross-tenant (operator hired в той же org), approved,
 *     operational status=active, assigned (siteId NOT NULL), site.status=active,
 *     не в другой живой смене;
 *   - state-machine transitions (active ⇄ paused → ended); advisory pause
 *     semantics (ADR 0006 §Pause semantics): paused — marker, не hard-lock;
 *   - time accounting при resume/end: `(now - paused_at)` + `total_pause_seconds`;
 *   - duplicate-active-shift guard: service-level check + DB partial UNIQUE
 *     страхует race. 23505 на uniqueIndex → 409 SHIFT_ALREADY_ACTIVE.
 *
 * Singleton. Per-request repository с ctx.
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
function shiftNotFound(): AppError {
  return new AppError({ statusCode: 404, code: 'SHIFT_NOT_FOUND', message: 'Shift not found' })
}
function craneNotFound(): AppError {
  return new AppError({ statusCode: 404, code: 'CRANE_NOT_FOUND', message: 'Crane not found' })
}
function conflict(code: string, message: string): AppError {
  return new AppError({ statusCode: 409, code, message })
}
function unprocessable(code: string, message: string, details?: Record<string, unknown>): AppError {
  return new AppError({ statusCode: 422, code, message, details })
}

export class ShiftService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly craneProfileService: CraneProfileService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  private repoFor(ctx: AuthContext): ShiftRepository {
    return new ShiftRepository(this.database, ctx)
  }

  // ---------- self (operator) ----------

  async start(
    ctx: AuthContext,
    input: StartShiftInput,
    meta: RequestMeta,
  ): Promise<ShiftWithRelations> {
    if (!shiftPolicy.canStart(ctx) || ctx.role !== 'operator') {
      throw forbidden('FORBIDDEN', 'Only operator can start a shift')
    }

    // canWork 3-gate — reuse logic из crane-profile.service. Если profile не
    // approved, или нет active hire, или license missing/expired — 422.
    const status = await this.craneProfileService.getMeStatus(ctx)
    if (!status.canWork) {
      throw unprocessable('CANNOT_START_SHIFT', 'Вы не можете начать смену', {
        reasons: status.canWorkReasons,
      })
    }

    const profile = status.profile

    // Crane eligibility — атомарный lookup: same-org membership approved+active
    // + crane approved + active + siteId NOT NULL + site.status=active.
    const eligibleCrane = await this.loadEligibleCrane(ctx.userId, profile, input.craneId)
    if (!eligibleCrane) {
      // 404: мы не должны раскрывать существует ли crane вообще и принадлежит
      // ли он чужой организации.
      throw craneNotFound()
    }

    // Duplicate active shift — пользователь уже «на смене». Service-level +
    // DB partial UNIQUE страхует race (ловим 23505 ниже).
    const repo = this.repoFor(ctx)
    const existing = await repo.findActiveForOperator(ctx.userId)
    if (existing) {
      throw conflict('SHIFT_ALREADY_ACTIVE', 'У вас уже есть активная смена')
    }

    // Crane занят другой сменой (другой оператор). 409 с явным сообщением.
    const craneBusy = await repo.findActiveOnCrane(eligibleCrane.crane.id)
    if (craneBusy) {
      throw conflict('CRANE_ALREADY_IN_SHIFT', 'Этот кран сейчас в работе у другого крановщика')
    }

    try {
      const created = await repo.create(
        {
          craneId: eligibleCrane.crane.id,
          operatorId: ctx.userId,
          craneProfileId: profile.id,
          organizationId: eligibleCrane.crane.organizationId,
          siteId: eligibleCrane.crane.siteId as string,
          notes: input.notes ?? null,
        },
        {
          actorUserId: ctx.userId,
          actorRole: ctx.role,
          ipAddress: meta.ipAddress,
          metadata: {
            craneId: eligibleCrane.crane.id,
            siteId: eligibleCrane.crane.siteId,
            organizationId: eligibleCrane.crane.organizationId,
          },
        },
      )

      const withRelations = await repo.findInScopeWithRelations(created.id)
      if (!withRelations) {
        // Race: shift удалён сразу после insert — защищаем от data-loss.
        this.logger.error({ id: created.id }, 'shift created but relations lookup returned null')
        throw shiftNotFound()
      }
      return withRelations
    } catch (err) {
      if (isPgUniqueViolation(err) && err.constraint_name === 'shifts_active_per_operator_idx') {
        throw conflict('SHIFT_ALREADY_ACTIVE', 'У вас уже есть активная смена')
      }
      this.logger.error({ err }, 'shift create unexpected error')
      throw err
    }
  }

  async pause(ctx: AuthContext, id: string, meta: RequestMeta): Promise<ShiftWithRelations> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScopeWithRelations(id)
    if (!existing) throw shiftNotFound()

    if (!shiftPolicy.canChangeStatus(ctx, existing.shift)) {
      throw forbidden('FORBIDDEN', 'Only the shift owner can change its status')
    }

    if (existing.shift.status === 'paused') {
      return existing // идемпотентно
    }
    if (existing.shift.status !== 'active') {
      throw conflict('INVALID_SHIFT_TRANSITION', `Cannot pause shift in ${existing.shift.status}`)
    }

    const now = new Date()
    const updated = await repo.pause(id, now, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: { from: 'active', to: 'paused' },
    })
    if (!updated) {
      // Race: кто-то сменил статус между find и update.
      throw conflict('INVALID_SHIFT_TRANSITION', 'Shift status changed concurrently')
    }
    const relations = await repo.findInScopeWithRelations(id)
    if (!relations) throw shiftNotFound()
    return relations
  }

  async resume(ctx: AuthContext, id: string, meta: RequestMeta): Promise<ShiftWithRelations> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScopeWithRelations(id)
    if (!existing) throw shiftNotFound()

    if (!shiftPolicy.canChangeStatus(ctx, existing.shift)) {
      throw forbidden('FORBIDDEN', 'Only the shift owner can change its status')
    }

    if (existing.shift.status === 'active') {
      return existing // идемпотентно
    }
    if (existing.shift.status !== 'paused') {
      throw conflict('INVALID_SHIFT_TRANSITION', `Cannot resume shift in ${existing.shift.status}`)
    }

    const pausedAt = existing.shift.pausedAt
    if (!pausedAt) {
      // Consistency CHECK на DB level защищает от этого, но на всякий случай.
      this.logger.error({ id }, 'paused shift without paused_at')
      throw conflict('INVALID_SHIFT_STATE', 'Paused shift missing paused_at')
    }
    const now = new Date()
    const pauseDurationSec = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000))
    const newTotal = existing.shift.totalPauseSeconds + pauseDurationSec

    const updated = await repo.resume(id, newTotal, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: { from: 'paused', to: 'active', addedPauseSeconds: pauseDurationSec },
    })
    if (!updated) throw conflict('INVALID_SHIFT_TRANSITION', 'Shift status changed concurrently')
    const relations = await repo.findInScopeWithRelations(id)
    if (!relations) throw shiftNotFound()
    return relations
  }

  async end(
    ctx: AuthContext,
    id: string,
    input: EndShiftInput,
    meta: RequestMeta,
  ): Promise<ShiftWithRelations> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScopeWithRelations(id)
    if (!existing) throw shiftNotFound()

    if (!shiftPolicy.canChangeStatus(ctx, existing.shift)) {
      throw forbidden('FORBIDDEN', 'Only the shift owner can end this shift')
    }

    if (existing.shift.status === 'ended') {
      throw conflict('SHIFT_ALREADY_ENDED', 'Shift is already ended')
    }

    const now = new Date()
    // Если ended во время pause — auto-resume accounting: добавляем pause
    // duration до конца смены.
    let totalPauseSeconds = existing.shift.totalPauseSeconds
    let autoResumedSec: number | undefined
    if (existing.shift.status === 'paused' && existing.shift.pausedAt) {
      autoResumedSec = Math.max(
        0,
        Math.floor((now.getTime() - existing.shift.pausedAt.getTime()) / 1000),
      )
      totalPauseSeconds += autoResumedSec
    }

    const updated = await repo.end(
      id,
      { endedAt: now, totalPauseSeconds, notes: input.notes },
      {
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        ipAddress: meta.ipAddress,
        metadata: {
          from: existing.shift.status,
          to: 'ended',
          totalPauseSeconds,
          autoResumedPauseSeconds: autoResumedSec ?? null,
        },
      },
    )
    if (!updated) throw conflict('INVALID_SHIFT_TRANSITION', 'Shift status changed concurrently')
    const relations = await repo.findInScopeWithRelations(id)
    if (!relations) throw shiftNotFound()
    return relations
  }

  // ---------- queries ----------

  async getMyActive(ctx: AuthContext): Promise<ShiftWithRelations | null> {
    if (ctx.role !== 'operator') {
      throw forbidden('FORBIDDEN', '/shifts/my/active is operator-only')
    }
    return this.repoFor(ctx).findActiveForOperatorWithRelations(ctx.userId)
  }

  async listMy(
    ctx: AuthContext,
    params: ListMyShiftsQuery,
  ): Promise<{ rows: ShiftWithRelations[]; nextCursor: string | null }> {
    if (ctx.role !== 'operator') {
      throw forbidden('FORBIDDEN', '/shifts/my is operator-only')
    }
    return this.repoFor(ctx).listMy(ctx.userId, { cursor: params.cursor, limit: params.limit })
  }

  async listOrg(
    ctx: AuthContext,
    params: ListOwnerShiftsQuery,
  ): Promise<{ rows: ShiftWithRelations[]; nextCursor: string | null }> {
    if (!shiftPolicy.canListOrg(ctx)) {
      throw forbidden('FORBIDDEN', '/shifts/owner is for owner or superadmin')
    }
    return this.repoFor(ctx).listForOrg({
      cursor: params.cursor,
      limit: params.limit,
      status: params.status,
      siteId: params.siteId,
      craneId: params.craneId,
      organizationId: ctx.role === 'superadmin' ? params.organizationId : undefined,
    })
  }

  async getById(ctx: AuthContext, id: string): Promise<ShiftWithRelations> {
    const row = await this.repoFor(ctx).findInScopeWithRelations(id)
    if (!row) throw shiftNotFound()
    if (!shiftPolicy.canRead(ctx, row.shift)) throw shiftNotFound()
    return row
  }

  async getAvailableCranes(ctx: AuthContext): Promise<AvailableCrane[]> {
    if (!shiftPolicy.canListAvailableCranes(ctx) || ctx.role !== 'operator') {
      throw forbidden('FORBIDDEN', '/shifts/available-cranes is operator-only')
    }
    return this.repoFor(ctx).listAvailableCranes(ctx.userId)
  }

  // ---------- internal helpers ----------

  /**
   * Проверяет: operator approved member в organization этого крана, сам кран
   * approved + active + с siteId, site.status='active'. Возвращает crane +
   * site info либо null (для 404-семантики).
   */
  private async loadEligibleCrane(
    operatorUserId: string,
    profile: CraneProfile,
    craneId: string,
  ): Promise<{ crane: Crane } | null> {
    const db = this.database.db

    // Кран с approval/operational checks. siteId NOT NULL — обязательно.
    const craneRows = await db
      .select()
      .from(cranes)
      .where(
        and(
          eq(cranes.id, craneId),
          eq(cranes.approvalStatus, 'approved'),
          eq(cranes.status, 'active'),
          isNull(cranes.deletedAt),
        ),
      )
      .limit(1)
    const craneRow = craneRows[0]
    if (!craneRow) return null
    if (!craneRow.siteId) return null

    // Hire record: profile approved+active в organization этого крана.
    const hireRows = await db
      .select({ id: organizationOperators.id })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .where(
        and(
          eq(craneProfiles.userId, operatorUserId),
          eq(craneProfiles.id, profile.id),
          eq(organizationOperators.organizationId, craneRow.organizationId),
          eq(organizationOperators.approvalStatus, 'approved'),
          eq(organizationOperators.status, 'active'),
          isNull(organizationOperators.deletedAt),
          isNull(craneProfiles.deletedAt),
        ),
      )
      .limit(1)
    if (!hireRows[0]) return null

    return {
      crane: {
        id: craneRow.id,
        organizationId: craneRow.organizationId,
        siteId: craneRow.siteId,
        type: craneRow.type,
        model: craneRow.model,
        inventoryNumber: craneRow.inventoryNumber,
        capacityTon: Number(craneRow.capacityTon),
        boomLengthM: craneRow.boomLengthM === null ? null : Number(craneRow.boomLengthM),
        yearManufactured: craneRow.yearManufactured,
        tariffsJson: (craneRow.tariffsJson ?? {}) as Record<string, unknown>,
        status: craneRow.status,
        approvalStatus: craneRow.approvalStatus,
        approvedByUserId: craneRow.approvedByUserId,
        approvedAt: craneRow.approvedAt,
        rejectedByUserId: craneRow.rejectedByUserId,
        rejectedAt: craneRow.rejectedAt,
        rejectionReason: craneRow.rejectionReason,
        notes: craneRow.notes,
        deletedAt: craneRow.deletedAt,
        createdAt: craneRow.createdAt,
        updatedAt: craneRow.updatedAt,
      },
    }
  }
}
