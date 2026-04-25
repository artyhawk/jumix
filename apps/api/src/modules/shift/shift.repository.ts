import type { AuthContext, UserRole } from '@jumix/auth'
import {
  type ChecklistItemRow,
  type Crane,
  type CraneApprovalStatus,
  type CraneStatus,
  type CraneType,
  type DatabaseClient,
  type NewShiftLocationPing,
  type OperatorStatus,
  type Shift,
  type ShiftLocationPing,
  type ShiftStatus,
  auditLog,
  craneProfiles,
  cranes,
  organizationOperators,
  organizations,
  preShiftChecklists,
  shiftLocationPings,
  shifts,
  sites,
} from '@jumix/db'
import { type SQL, and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'

/**
 * ShiftRepository — data access для shifts (M4, ADR 0006).
 *
 * Tenant scope по AuthContext:
 *   - operator   — видит только свои shift'ы (operator_id = ctx.userId)
 *   - owner      — все shift'ы своей организации
 *   - superadmin — все
 *
 * Mutations (`create`, `pause`, `resume`, `end`) — всегда в транзакции с
 * audit_log (проектный инвариант). Shift'ы НЕ soft-delete'ятся в MVP.
 */

export type AuditMeta = {
  actorUserId: string
  actorRole: UserRole
  ipAddress: string | null
  metadata: Record<string, unknown>
}

type ShiftRow = typeof shifts.$inferSelect

export type ShiftSiteSummary = {
  id: string
  name: string
  address: string | null
  /** PostGIS geography → ST_Y/ST_X extraction (M5-b, для mobile geofence init). */
  latitude: number
  longitude: number
  geofenceRadiusM: number
}

export type ShiftWithRelations = {
  shift: Shift
  crane: Pick<Crane, 'id' | 'model' | 'inventoryNumber' | 'type' | 'capacityTon'>
  site: ShiftSiteSummary
  organization: { id: string; name: string }
  operator: { id: string; firstName: string; lastName: string; patronymic: string | null }
}

export type AvailableCrane = {
  id: string
  model: string
  inventoryNumber: string | null
  type: CraneType
  capacityTon: number
  site: { id: string; name: string; address: string | null }
  organization: { id: string; name: string }
}

export type LatestActiveLocationRow = {
  shift: Shift
  ping: ShiftLocationPing
  crane: Pick<Crane, 'id' | 'model' | 'inventoryNumber' | 'type' | 'capacityTon'>
  site: { id: string; name: string; address: string | null }
  operator: { id: string; firstName: string; lastName: string; patronymic: string | null }
}

function hydrate(row: ShiftRow): Shift {
  return {
    id: row.id,
    craneId: row.craneId,
    operatorId: row.operatorId,
    craneProfileId: row.craneProfileId,
    organizationId: row.organizationId,
    siteId: row.siteId,
    status: row.status as ShiftStatus,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    pausedAt: row.pausedAt,
    totalPauseSeconds: row.totalPauseSeconds,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function hydratePing(row: typeof shiftLocationPings.$inferSelect): ShiftLocationPing {
  // latitude/longitude — drizzle numeric → строка; конвертируем в число.
  // accuracy_meters — real, обычно уже number, но для безопасности тоже коэрсим.
  return {
    id: row.id,
    shiftId: row.shiftId,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: row.accuracyMeters === null ? null : Number(row.accuracyMeters),
    recordedAt: row.recordedAt,
    insideGeofence: row.insideGeofence,
    createdAt: row.createdAt,
  }
}

const LIVE_STATUSES: ShiftStatus[] = ['active', 'paused']

export type ShiftCreateInput = {
  craneId: string
  operatorId: string
  craneProfileId: string
  organizationId: string
  siteId: string
  notes: string | null
}

export type ChecklistInsert = {
  items: Record<string, ChecklistItemRow>
  generalNotes: string | null
}

export type ListMyParams = {
  cursor?: string
  limit: number
}

export type ListOwnerParams = {
  cursor?: string
  limit: number
  status?: ShiftStatus | 'live' | 'all'
  siteId?: string
  craneId?: string
  organizationId?: string
}

/**
 * Site select с PostGIS coords extraction. ST_X/ST_Y могут вернуть
 * string (double-как-текст) от postgres-js → Number() в hydrate.
 */
const SITE_SELECT = {
  id: sites.id,
  name: sites.name,
  address: sites.address,
  latitude: sql<string | number>`ST_Y(${sites.geofenceCenter}::geometry)`.as('site_latitude'),
  longitude: sql<string | number>`ST_X(${sites.geofenceCenter}::geometry)`.as('site_longitude'),
  geofenceRadiusM: sites.geofenceRadiusM,
} as const

type SiteJoinRow = {
  id: string
  name: string
  address: string | null
  latitude: string | number
  longitude: string | number
  geofenceRadiusM: number
}

type JoinedRow = {
  shift: ShiftRow
  crane: typeof cranes.$inferSelect
  site: SiteJoinRow
  organization: typeof organizations.$inferSelect
  profile: typeof craneProfiles.$inferSelect
}

function mapRelations(row: JoinedRow): ShiftWithRelations {
  return {
    shift: hydrate(row.shift),
    crane: {
      id: row.crane.id,
      model: row.crane.model,
      inventoryNumber: row.crane.inventoryNumber,
      type: row.crane.type as CraneType,
      capacityTon: Number(row.crane.capacityTon),
    },
    site: {
      id: row.site.id,
      name: row.site.name,
      address: row.site.address,
      latitude: Number(row.site.latitude),
      longitude: Number(row.site.longitude),
      geofenceRadiusM: row.site.geofenceRadiusM,
    },
    organization: {
      id: row.organization.id,
      name: row.organization.name,
    },
    operator: {
      id: row.profile.id,
      firstName: row.profile.firstName,
      lastName: row.profile.lastName,
      patronymic: row.profile.patronymic,
    },
  }
}

export class ShiftRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly ctx: AuthContext,
  ) {}

  /** Scoped lookup по id с JOIN'ами для DTO. */
  async findInScopeWithRelations(id: string): Promise<ShiftWithRelations | null> {
    const conds: SQL[] = [eq(shifts.id, id)]
    if (this.ctx.role === 'owner') {
      conds.push(eq(shifts.organizationId, this.ctx.organizationId))
    } else if (this.ctx.role === 'operator') {
      conds.push(eq(shifts.operatorId, this.ctx.userId))
    }

    const rows = await this.database.db
      .select({
        shift: shifts,
        crane: cranes,
        site: SITE_SELECT,
        organization: organizations,
        profile: craneProfiles,
      })
      .from(shifts)
      .innerJoin(cranes, eq(shifts.craneId, cranes.id))
      .innerJoin(sites, eq(shifts.siteId, sites.id))
      .innerJoin(organizations, eq(shifts.organizationId, organizations.id))
      .innerJoin(craneProfiles, eq(shifts.craneProfileId, craneProfiles.id))
      .where(and(...conds))
      .limit(1)

    const row = rows[0]
    return row ? mapRelations(row) : null
  }

  /** Текущий active/paused shift оператора. Null если нет живой смены. */
  async findActiveForOperator(operatorId: string): Promise<Shift | null> {
    const rows = await this.database.db
      .select()
      .from(shifts)
      .where(and(eq(shifts.operatorId, operatorId), inArray(shifts.status, LIVE_STATUSES)))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  async findActiveForOperatorWithRelations(operatorId: string): Promise<ShiftWithRelations | null> {
    const rows = await this.database.db
      .select({
        shift: shifts,
        crane: cranes,
        site: SITE_SELECT,
        organization: organizations,
        profile: craneProfiles,
      })
      .from(shifts)
      .innerJoin(cranes, eq(shifts.craneId, cranes.id))
      .innerJoin(sites, eq(shifts.siteId, sites.id))
      .innerJoin(organizations, eq(shifts.organizationId, organizations.id))
      .innerJoin(craneProfiles, eq(shifts.craneProfileId, craneProfiles.id))
      .where(and(eq(shifts.operatorId, operatorId), inArray(shifts.status, LIVE_STATUSES)))
      .limit(1)
    const row = rows[0]
    return row ? mapRelations(row) : null
  }

  /** Проверка что crane сейчас в другой active/paused смене. */
  async findActiveOnCrane(craneId: string): Promise<Shift | null> {
    const rows = await this.database.db
      .select()
      .from(shifts)
      .where(and(eq(shifts.craneId, craneId), inArray(shifts.status, LIVE_STATUSES)))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  /** История смен оператора. DESC by id. */
  async listMy(
    operatorId: string,
    params: ListMyParams,
  ): Promise<{ rows: ShiftWithRelations[]; nextCursor: string | null }> {
    const conds: SQL[] = [eq(shifts.operatorId, operatorId)]
    if (params.cursor) conds.push(lt(shifts.id, params.cursor))

    const rows = await this.database.db
      .select({
        shift: shifts,
        crane: cranes,
        site: SITE_SELECT,
        organization: organizations,
        profile: craneProfiles,
      })
      .from(shifts)
      .innerJoin(cranes, eq(shifts.craneId, cranes.id))
      .innerJoin(sites, eq(shifts.siteId, sites.id))
      .innerJoin(organizations, eq(shifts.organizationId, organizations.id))
      .innerJoin(craneProfiles, eq(shifts.craneProfileId, craneProfiles.id))
      .where(and(...conds))
      .orderBy(desc(shifts.id))
      .limit(params.limit + 1)

    const hasMore = rows.length > params.limit
    const page = (hasMore ? rows.slice(0, params.limit) : rows).map(mapRelations)
    const nextCursor = hasMore ? (page.at(-1)?.shift.id ?? null) : null
    return { rows: page, nextCursor }
  }

  /** Owner/superadmin list. */
  async listForOrg(
    params: ListOwnerParams,
  ): Promise<{ rows: ShiftWithRelations[]; nextCursor: string | null }> {
    const conds: SQL[] = []
    if (this.ctx.role === 'owner') {
      conds.push(eq(shifts.organizationId, this.ctx.organizationId))
    } else if (params.organizationId) {
      conds.push(eq(shifts.organizationId, params.organizationId))
    }
    if (params.cursor) conds.push(lt(shifts.id, params.cursor))
    if (params.siteId) conds.push(eq(shifts.siteId, params.siteId))
    if (params.craneId) conds.push(eq(shifts.craneId, params.craneId))

    const status = params.status ?? 'live'
    if (status === 'live') {
      conds.push(inArray(shifts.status, LIVE_STATUSES))
    } else if (status !== 'all') {
      conds.push(eq(shifts.status, status))
    }

    const rows = await this.database.db
      .select({
        shift: shifts,
        crane: cranes,
        site: SITE_SELECT,
        organization: organizations,
        profile: craneProfiles,
      })
      .from(shifts)
      .innerJoin(cranes, eq(shifts.craneId, cranes.id))
      .innerJoin(sites, eq(shifts.siteId, sites.id))
      .innerJoin(organizations, eq(shifts.organizationId, organizations.id))
      .innerJoin(craneProfiles, eq(shifts.craneProfileId, craneProfiles.id))
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(shifts.id))
      .limit(params.limit + 1)

    const hasMore = rows.length > params.limit
    const page = (hasMore ? rows.slice(0, params.limit) : rows).map(mapRelations)
    const nextCursor = hasMore ? (page.at(-1)?.shift.id ?? null) : null
    return { rows: page, nextCursor }
  }

  /**
   * Eligible cranes для start shift. Operator — approved crane_profile с
   * approved+active hire в организации. Crane — approved + active + siteId
   * NOT NULL + site.status=active. Исключает cranes уже в живой смене.
   */
  async listAvailableCranes(operatorId: string): Promise<AvailableCrane[]> {
    // Organizations где operator approved+active member.
    const memberRows = await this.database.db
      .select({ organizationId: organizationOperators.organizationId })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .where(
        and(
          eq(craneProfiles.userId, operatorId),
          isNull(organizationOperators.deletedAt),
          isNull(craneProfiles.deletedAt),
          eq(organizationOperators.approvalStatus, 'approved'),
          eq(organizationOperators.status, 'active' satisfies OperatorStatus),
          eq(craneProfiles.approvalStatus, 'approved'),
        ),
      )
    const orgIds = Array.from(new Set(memberRows.map((m) => m.organizationId)))
    if (orgIds.length === 0) return []

    // Busy crane ids — те что в active/paused shift.
    const busyCraneRows = await this.database.db
      .select({ craneId: shifts.craneId })
      .from(shifts)
      .where(inArray(shifts.status, LIVE_STATUSES))
    const busyCraneIds = new Set(busyCraneRows.map((r) => r.craneId))

    const rows = await this.database.db
      .select({
        crane: cranes,
        site: SITE_SELECT,
        organization: organizations,
      })
      .from(cranes)
      // innerJoin sites → фильтрует cranes без siteId automatically.
      .innerJoin(sites, eq(cranes.siteId, sites.id))
      .innerJoin(organizations, eq(cranes.organizationId, organizations.id))
      .where(
        and(
          inArray(cranes.organizationId, orgIds),
          eq(cranes.approvalStatus, 'approved' satisfies CraneApprovalStatus),
          eq(cranes.status, 'active' satisfies CraneStatus),
          isNull(cranes.deletedAt),
          eq(sites.status, 'active'),
        ),
      )
      .orderBy(desc(cranes.createdAt))

    return rows
      .filter((r) => !busyCraneIds.has(r.crane.id))
      .map((row) => ({
        id: row.crane.id,
        model: row.crane.model,
        inventoryNumber: row.crane.inventoryNumber,
        type: row.crane.type as CraneType,
        capacityTon: Number(row.crane.capacityTon),
        site: {
          id: row.site.id,
          name: row.site.name,
          address: row.site.address,
        },
        organization: {
          id: row.organization.id,
          name: row.organization.name,
        },
      }))
  }

  /** Count distinct cranes с active/paused shift в organization. */
  async countOperatingCranesForOrg(organizationId: string): Promise<number> {
    const rows = await this.database.db
      .selectDistinct({ craneId: shifts.craneId })
      .from(shifts)
      .where(and(eq(shifts.organizationId, organizationId), inArray(shifts.status, LIVE_STATUSES)))
    return rows.length
  }

  /**
   * Atomic shift start (M6, ADR 0008): создаёт shift + pre_shift_checklist
   * + audit `shift.start` + audit `checklist.submit` в одной транзакции.
   * Если что-то падает — full rollback (no orphan shift, no orphan checklist).
   *
   * checklist=null допустим только в backward-compat тестах (postgres-js
   * раннее B2d). Production code всегда передаёт checklist (валидация на
   * service-слое).
   */
  async create(
    input: ShiftCreateInput,
    audit: AuditMeta,
    checklist: ChecklistInsert,
  ): Promise<Shift> {
    return this.database.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(shifts)
        .values({
          craneId: input.craneId,
          operatorId: input.operatorId,
          craneProfileId: input.craneProfileId,
          organizationId: input.organizationId,
          siteId: input.siteId,
          notes: input.notes,
          // status defaults 'active', startedAt defaults now().
        })
        .returning()

      const row = inserted[0]
      if (!row) throw new Error('shift insert returned no rows')

      await tx.insert(preShiftChecklists).values({
        shiftId: row.id,
        items: checklist.items,
        generalNotes: checklist.generalNotes,
      })

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'shift.start',
        targetType: 'shift',
        targetId: row.id,
        organizationId: row.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'checklist.submit',
        targetType: 'shift',
        targetId: row.id,
        organizationId: row.organizationId,
        metadata: {
          itemKeys: Object.keys(checklist.items),
          itemCount: Object.keys(checklist.items).length,
        },
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async pause(id: string, pausedAt: Date, audit: AuditMeta): Promise<Shift | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(shifts)
        .set({ status: 'paused', pausedAt, updatedAt: new Date() })
        .where(and(eq(shifts.id, id), eq(shifts.status, 'active')))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'shift.pause',
        targetType: 'shift',
        targetId: id,
        organizationId: row.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async resume(id: string, totalPauseSeconds: number, audit: AuditMeta): Promise<Shift | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(shifts)
        .set({
          status: 'active',
          pausedAt: null,
          totalPauseSeconds,
          updatedAt: new Date(),
        })
        .where(and(eq(shifts.id, id), eq(shifts.status, 'paused')))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'shift.resume',
        targetType: 'shift',
        targetId: id,
        organizationId: row.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  // ---------- M5: location pings (ADR 0007) ----------

  /**
   * Batch insert pings. Возвращает inserted rows (для response counting).
   * Не в транзакции с audit_log — geofence-transition audit пишется отдельно
   * в service после анализа state change.
   */
  async insertPings(values: NewShiftLocationPing[]): Promise<ShiftLocationPing[]> {
    if (values.length === 0) return []
    const rows = await this.database.db.insert(shiftLocationPings).values(values).returning()
    return rows.map(hydratePing)
  }

  /** Latest ping per shift by recorded_at DESC. Null если нет pings. */
  async findLatestPingForShift(shiftId: string): Promise<ShiftLocationPing | null> {
    const rows = await this.database.db
      .select()
      .from(shiftLocationPings)
      .where(eq(shiftLocationPings.shiftId, shiftId))
      .orderBy(desc(shiftLocationPings.recordedAt))
      .limit(1)
    return rows[0] ? hydratePing(rows[0]) : null
  }

  /** Все pings shift'а в хронологическом порядке (ASC). */
  async listPingsForShift(shiftId: string): Promise<ShiftLocationPing[]> {
    const rows = await this.database.db
      .select()
      .from(shiftLocationPings)
      .where(eq(shiftLocationPings.shiftId, shiftId))
      .orderBy(shiftLocationPings.recordedAt)
    return rows.map(hydratePing)
  }

  /**
   * Latest ping per active/paused shift в scope (org для owner, all для
   * superadmin). Использует ROW_NUMBER() window function для "last per group".
   * Anti-N+1: сразу JOIN'ит crane/operator/site для DTO-ready результата.
   */
  async listLatestActiveLocations(params: {
    organizationId?: string
    siteId?: string
  }): Promise<LatestActiveLocationRow[]> {
    const conds: SQL[] = [inArray(shifts.status, LIVE_STATUSES)]
    if (params.organizationId) conds.push(eq(shifts.organizationId, params.organizationId))
    if (params.siteId) conds.push(eq(shifts.siteId, params.siteId))

    const rows = await this.database.db
      .select({
        shift: shifts,
        ping: shiftLocationPings,
        crane: cranes,
        site: SITE_SELECT,
        profile: craneProfiles,
        rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${shifts.id} ORDER BY ${shiftLocationPings.recordedAt} DESC)`.as(
          'rn',
        ),
      })
      .from(shifts)
      .innerJoin(shiftLocationPings, eq(shiftLocationPings.shiftId, shifts.id))
      .innerJoin(cranes, eq(shifts.craneId, cranes.id))
      .innerJoin(sites, eq(shifts.siteId, sites.id))
      .innerJoin(craneProfiles, eq(shifts.craneProfileId, craneProfiles.id))
      .where(and(...conds))

    // Drizzle не умеет WHERE rn=1 на уровне построения — post-filter.
    // Scale acceptable: N active shifts × avg pings per shift; на MVP
    // никогда не больше ~100 × ~500.
    return rows
      .filter((r) => Number(r.rn) === 1)
      .map((r) => ({
        shift: hydrate(r.shift),
        ping: hydratePing(r.ping),
        crane: {
          id: r.crane.id,
          model: r.crane.model,
          inventoryNumber: r.crane.inventoryNumber,
          type: r.crane.type as CraneType,
          capacityTon: Number(r.crane.capacityTon),
        },
        site: { id: r.site.id, name: r.site.name, address: r.site.address },
        operator: {
          id: r.profile.id,
          firstName: r.profile.firstName,
          lastName: r.profile.lastName,
          patronymic: r.profile.patronymic,
        },
      }))
  }

  async end(
    id: string,
    input: { endedAt: Date; totalPauseSeconds: number; notes: string | null | undefined },
    audit: AuditMeta,
  ): Promise<Shift | null> {
    return this.database.db.transaction(async (tx) => {
      const set: Record<string, unknown> = {
        status: 'ended',
        endedAt: input.endedAt,
        pausedAt: null,
        totalPauseSeconds: input.totalPauseSeconds,
        updatedAt: new Date(),
      }
      if (input.notes !== undefined) set.notes = input.notes

      const rows = await tx
        .update(shifts)
        .set(set)
        .where(and(eq(shifts.id, id), inArray(shifts.status, LIVE_STATUSES)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'shift.end',
        targetType: 'shift',
        targetId: id,
        organizationId: row.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }
}
