import type { AuthContext } from '@jumix/auth'
import {
  type Crane,
  type CraneProfile,
  type DatabaseClient,
  type ShiftLocationPing,
  auditLog,
  craneProfiles,
  cranes,
  organizationOperators,
} from '@jumix/db'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../lib/errors'
import type { CraneProfileService } from '../crane-profile/crane-profile.service'
import { shiftPolicy } from './shift.policy'
import {
  type AvailableCrane,
  type LatestActiveLocationRow,
  ShiftRepository,
  type ShiftWithRelations,
} from './shift.repository'
import type {
  EndShiftInput,
  IngestPingsInput,
  ListMyShiftsQuery,
  ListOwnerShiftsQuery,
  OwnerLocationsLatestQuery,
  ShiftPathQuery,
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

export type IngestPingsResult = {
  accepted: number
  rejected: Array<{ index: number; reason: string }>
}

/**
 * DTO-ready ping-with-context для owner map. `minutesSinceLastPing` computed
 * в момент query (не хранится). `insideGeofence` re-derived в service: client
 * мог прислать null (unknown) или mismatch с сервер-side site radius — на
 * этом endpoint мы re-check через Haversine vs site.geofenceRadiusM, чтобы
 * owner видел консистентную картину независимо от client state.
 */
export type ActiveLocationDTO = {
  shiftId: string
  craneId: string
  operatorId: string
  siteId: string
  latitude: number
  longitude: number
  accuracyMeters: number | null
  recordedAt: string
  insideGeofence: boolean | null
  minutesSinceLastPing: number
  crane: {
    id: string
    model: string
    inventoryNumber: string | null
    type: string
    capacityTon: number
  }
  operator: { id: string; firstName: string; lastName: string; patronymic: string | null }
  site: { id: string; name: string; address: string | null }
}

export type ShiftPathDTO = {
  shiftId: string
  pings: Array<{
    latitude: number
    longitude: number
    accuracyMeters: number | null
    recordedAt: string
    insideGeofence: boolean | null
  }>
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

function pingToSummary(p: ShiftLocationPing): ShiftPathDTO['pings'][number] {
  return {
    latitude: p.latitude,
    longitude: p.longitude,
    accuracyMeters: p.accuracyMeters,
    recordedAt: p.recordedAt.toISOString(),
    insideGeofence: p.insideGeofence,
  }
}

function toActiveLocationDTO(row: LatestActiveLocationRow, nowMs: number): ActiveLocationDTO {
  const pingMs = row.ping.recordedAt.getTime()
  const minutesSinceLastPing = Math.max(0, Math.floor((nowMs - pingMs) / 60_000))
  return {
    shiftId: row.shift.id,
    craneId: row.shift.craneId,
    operatorId: row.shift.operatorId,
    siteId: row.shift.siteId,
    latitude: row.ping.latitude,
    longitude: row.ping.longitude,
    accuracyMeters: row.ping.accuracyMeters,
    recordedAt: row.ping.recordedAt.toISOString(),
    insideGeofence: row.ping.insideGeofence,
    minutesSinceLastPing,
    crane: row.crane,
    operator: row.operator,
    site: row.site,
  }
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

  // ---------- M5: location pings (ADR 0007) ----------

  /**
   * Batch-ingest location pings от mobile клиента. Validations:
   *   - shift принадлежит ctx.userId (operator-only);
   *   - shift.status ∈ (active, paused) — ended shifts reject всё;
   *   - per-ping: latitude/longitude уже валидированы Zod'ом до сервиса;
   *     здесь NaN-guard и recordedAt sanity (не в будущем более чем на 5 мин).
   *
   * Partial reject: невалидные pings не блокируют валидные — inserting все
   * разрешённые, возвращаем {accepted, rejected[]}. Client markет synced
   * только accepted'ы (по порядку), остальные retry'им позже.
   *
   * Geofence transition audit: сравниваем `insideGeofence` последнего нового
   * ping'а (из этого batch'а) с state *последнего ping'а ДО batch'а*. Если
   * состояние изменилось — пишем `shift.geofence_exit` или `shift.geofence_entry`.
   * Переходы internal-к-batch игнорируем (в batch'е может быть 5 pings
   * inside → 10 outside → 3 inside — нам интересна только итоговая граница).
   * Advisory UX (mobile banner) работает на клиенте, сервер только логирует.
   */
  async ingestPings(
    ctx: AuthContext,
    shiftId: string,
    input: IngestPingsInput,
    meta: RequestMeta,
  ): Promise<IngestPingsResult> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScopeWithRelations(shiftId)
    if (!existing) throw shiftNotFound()

    if (!shiftPolicy.canIngestPings(ctx, existing.shift)) {
      throw forbidden('FORBIDDEN', 'Only the shift owner can ingest pings')
    }

    if (existing.shift.status === 'ended') {
      throw unprocessable('SHIFT_ENDED', 'Cannot ingest pings for ended shift')
    }

    // Validate per-ping (Zod уже покрыл numeric ranges, здесь — business edge-cases).
    const now = Date.now()
    const FUTURE_TOLERANCE_MS = 5 * 60 * 1000
    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 дней — safety bound
    const accepted: Array<{
      index: number
      ping: IngestPingsInput['pings'][number]
      recordedAt: Date
    }> = []
    const rejected: Array<{ index: number; reason: string }> = []

    for (let i = 0; i < input.pings.length; i += 1) {
      const p = input.pings[i]
      if (!p) continue
      const ts = Date.parse(p.recordedAt)
      if (Number.isNaN(ts)) {
        rejected.push({ index: i, reason: 'INVALID_TIMESTAMP' })
        continue
      }
      if (ts > now + FUTURE_TOLERANCE_MS) {
        rejected.push({ index: i, reason: 'FUTURE_TIMESTAMP' })
        continue
      }
      if (ts < now - MAX_AGE_MS) {
        rejected.push({ index: i, reason: 'STALE_TIMESTAMP' })
        continue
      }
      accepted.push({ index: i, ping: p, recordedAt: new Date(ts) })
    }

    if (accepted.length === 0) {
      return { accepted: 0, rejected }
    }

    // Previous latest ping (до этого batch'а) — для transition detection.
    const prevLatest = await repo.findLatestPingForShift(shiftId)

    await repo.insertPings(
      accepted.map((a) => ({
        shiftId,
        latitude: a.ping.latitude.toFixed(7),
        longitude: a.ping.longitude.toFixed(7),
        accuracyMeters: a.ping.accuracyMeters,
        recordedAt: a.recordedAt,
        insideGeofence: a.ping.insideGeofence,
      })),
    )

    // Transition detection: compare prev state vs latest-in-batch (по
    // recordedAt ASC — берём max).
    const sortedAccepted = [...accepted].sort(
      (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
    )
    const newestInBatch = sortedAccepted[sortedAccepted.length - 1]
    const prevInside = prevLatest?.insideGeofence ?? null
    const nextInside = newestInBatch?.ping.insideGeofence ?? null

    // Write audit только когда обе стороны определены и состояние сменилось.
    // null на одной стороне (unknown) не считаем transition'ом — слишком шумно.
    if (prevInside !== null && nextInside !== null && prevInside !== nextInside) {
      const action = nextInside ? 'shift.geofence_entry' : 'shift.geofence_exit'
      await this.database.db.insert(auditLog).values({
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        action,
        targetType: 'shift',
        targetId: shiftId,
        organizationId: existing.shift.organizationId,
        metadata: {
          recordedAt: newestInBatch?.recordedAt.toISOString(),
          latitude: newestInBatch?.ping.latitude,
          longitude: newestInBatch?.ping.longitude,
          accuracyMeters: newestInBatch?.ping.accuracyMeters,
        },
        ipAddress: meta.ipAddress,
      })
    }

    return { accepted: accepted.length, rejected }
  }

  /**
   * Latest location per active/paused shift в scope owner'а/superadmin'а.
   * Используется owner'ским map'ом (polling 30s). Stale-detection через
   * `minutesSinceLastPing` — на клиенте > 10 минут = marker-warning стиль.
   */
  async getLatestLocations(
    ctx: AuthContext,
    params: OwnerLocationsLatestQuery,
  ): Promise<ActiveLocationDTO[]> {
    if (!shiftPolicy.canListLocationsForOrg(ctx)) {
      throw forbidden('FORBIDDEN', '/shifts/owner/locations-latest is owner/superadmin only')
    }
    const rows = await this.repoFor(ctx).listLatestActiveLocations({
      organizationId: ctx.role === 'owner' ? ctx.organizationId : undefined,
      siteId: params.siteId,
    })
    const now = Date.now()
    return rows.map((r) => toActiveLocationDTO(r, now))
  }

  /**
   * Shift path — все pings смены ASC по времени. sampleRate downsample'ит
   * (каждый N-ый). Для 500 pings + sampleRate=5 → 100 точек polyline, что
   * достаточно для визуализации маршрута без перегрузки network/render'а.
   */
  async getShiftPath(
    ctx: AuthContext,
    shiftId: string,
    query: ShiftPathQuery,
  ): Promise<ShiftPathDTO> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScopeWithRelations(shiftId)
    if (!existing) throw shiftNotFound()
    if (!shiftPolicy.canReadPath(ctx, existing.shift)) throw shiftNotFound()

    const rate = query.sampleRate
    const all = await repo.listPingsForShift(shiftId)
    const sampled = rate === 1 ? all : all.filter((_, i) => i % rate === 0)
    return {
      shiftId,
      pings: sampled.map(pingToSummary),
    }
  }

  /**
   * Operator's own latest ping — debugging/backup path. В MVP mobile
   * рассчитывает state локально, но endpoint полезен для QA.
   */
  async getMyActiveLocation(
    ctx: AuthContext,
  ): Promise<{ shiftId: string; ping: ShiftLocationPing } | null> {
    if (ctx.role !== 'operator') {
      throw forbidden('FORBIDDEN', '/shifts/my/active/location is operator-only')
    }
    const active = await this.repoFor(ctx).findActiveForOperator(ctx.userId)
    if (!active) return null
    const ping = await this.repoFor(ctx).findLatestPingForShift(active.id)
    if (!ping) return null
    return { shiftId: active.id, ping }
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
