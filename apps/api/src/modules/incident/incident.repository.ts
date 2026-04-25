import type { AuthContext, UserRole } from '@jumix/auth'
import {
  type CraneType,
  type DatabaseClient,
  type Incident,
  type IncidentPhoto,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentType,
  auditLog,
  cranes,
  incidentPhotos,
  incidents,
  shifts,
  sites,
} from '@jumix/db'
import { type SQL, and, count, desc, eq, inArray, lt } from 'drizzle-orm'

/**
 * IncidentRepository (M6, ADR 0008). Tenant-scope:
 *   - operator   — только свои (reporter_user_id = ctx.userId)
 *   - owner      — все incidents в своей organization
 *   - superadmin — все
 *
 * Photos подгружаются вторым query'ем — count небольшой (max 5/incident),
 * предсказуемый, JOIN+aggregate усложнил бы маппинг без profit'а.
 */

export type AuditMeta = {
  actorUserId: string
  actorRole: UserRole
  ipAddress: string | null
  metadata: Record<string, unknown>
}

type IncidentRow = typeof incidents.$inferSelect
type PhotoRow = typeof incidentPhotos.$inferSelect

export type IncidentRelations = {
  shift: { id: string; startedAt: Date; endedAt: Date | null } | null
  site: { id: string; name: string; address: string | null } | null
  crane: {
    id: string
    model: string
    inventoryNumber: string | null
    type: CraneType
  } | null
}

export type IncidentWithRelations = {
  incident: Incident
  photos: IncidentPhoto[]
  relations: IncidentRelations
}

function hydrateIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    reporterUserId: row.reporterUserId,
    reporterName: row.reporterName,
    reporterPhone: row.reporterPhone,
    organizationId: row.organizationId,
    shiftId: row.shiftId,
    siteId: row.siteId,
    craneId: row.craneId,
    type: row.type as IncidentType,
    severity: row.severity as IncidentSeverity,
    status: row.status as IncidentStatus,
    description: row.description,
    reportedAt: row.reportedAt,
    acknowledgedAt: row.acknowledgedAt,
    acknowledgedByUserId: row.acknowledgedByUserId,
    resolvedAt: row.resolvedAt,
    resolvedByUserId: row.resolvedByUserId,
    resolutionNotes: row.resolutionNotes,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function hydratePhoto(row: PhotoRow): IncidentPhoto {
  return {
    id: row.id,
    incidentId: row.incidentId,
    storageKey: row.storageKey,
    uploadedAt: row.uploadedAt,
  }
}

export type IncidentCreateInput = {
  reporterUserId: string
  reporterName: string
  reporterPhone: string
  organizationId: string
  shiftId: string | null
  siteId: string | null
  craneId: string | null
  type: IncidentType
  severity: IncidentSeverity
  description: string
  latitude: number | null
  longitude: number | null
  photoKeys: string[]
}

export type ListMyParams = { cursor?: string; limit: number }

export type ListOrgParams = {
  cursor?: string
  limit: number
  status?: IncidentStatus
  severity?: IncidentSeverity
  type?: IncidentType
  siteId?: string
  craneId?: string
}

export class IncidentRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly ctx: AuthContext,
  ) {}

  /** Lookup в scope; null если нет доступа или не существует. */
  async findInScope(id: string): Promise<IncidentWithRelations | null> {
    const conds: SQL[] = [eq(incidents.id, id)]
    if (this.ctx.role === 'owner') {
      conds.push(eq(incidents.organizationId, this.ctx.organizationId))
    } else if (this.ctx.role === 'operator') {
      conds.push(eq(incidents.reporterUserId, this.ctx.userId))
    }

    const row = (
      await this.database.db
        .select()
        .from(incidents)
        .where(and(...conds))
        .limit(1)
    )[0]
    if (!row) return null
    const [hydrated] = await this.hydrateMany([row])
    return hydrated ?? null
  }

  /** Без scope-check — для service-слоя при mutation после policy check. */
  async findAnyById(id: string): Promise<IncidentWithRelations | null> {
    const row = (
      await this.database.db.select().from(incidents).where(eq(incidents.id, id)).limit(1)
    )[0]
    if (!row) return null
    const [hydrated] = await this.hydrateMany([row])
    return hydrated ?? null
  }

  /**
   * Bulk-hydrate N incidents с relations + photos за фиксированное число
   * запросов (4 — photos + shifts + sites + cranes), независимо от N. Это
   * избавляет от N×3 fan-out для list endpoints (owner queue 20 incidents
   * = 4 queries вместо 60+). Single-row пути (`findInScope`/`findAnyById`)
   * также проходят через эту функцию — overhead на пустые `inArray()` нет
   * (early-return когда соответствующий nullable id не set ни у одного row).
   */
  private async hydrateMany(rows: IncidentRow[]): Promise<IncidentWithRelations[]> {
    if (rows.length === 0) return []

    const incidentIds = rows.map((r) => r.id)
    const shiftIds = unique(rows.map((r) => r.shiftId))
    const siteIds = unique(rows.map((r) => r.siteId))
    const craneIds = unique(rows.map((r) => r.craneId))

    const photoRowsAll = await this.database.db
      .select()
      .from(incidentPhotos)
      .where(inArray(incidentPhotos.incidentId, incidentIds))
      .orderBy(incidentPhotos.uploadedAt)

    const shiftRows =
      shiftIds.length > 0
        ? await this.database.db
            .select({
              id: shifts.id,
              startedAt: shifts.startedAt,
              endedAt: shifts.endedAt,
            })
            .from(shifts)
            .where(inArray(shifts.id, shiftIds))
        : []

    const siteRows =
      siteIds.length > 0
        ? await this.database.db
            .select({ id: sites.id, name: sites.name, address: sites.address })
            .from(sites)
            .where(inArray(sites.id, siteIds))
        : []

    const craneRows =
      craneIds.length > 0
        ? await this.database.db
            .select({
              id: cranes.id,
              model: cranes.model,
              inventoryNumber: cranes.inventoryNumber,
              type: cranes.type,
            })
            .from(cranes)
            .where(inArray(cranes.id, craneIds))
        : []

    // Build index maps для O(1) lookup per incident.
    const photosByIncident = new Map<string, IncidentPhoto[]>()
    for (const p of photoRowsAll) {
      const list = photosByIncident.get(p.incidentId) ?? []
      list.push(hydratePhoto(p))
      photosByIncident.set(p.incidentId, list)
    }
    const shiftById = new Map(shiftRows.map((s) => [s.id, s]))
    const siteById = new Map(siteRows.map((s) => [s.id, s]))
    const craneById = new Map(craneRows.map((c) => [c.id, c]))

    return rows.map((row) => {
      const incident = hydrateIncident(row)
      const photos = photosByIncident.get(incident.id) ?? []
      const relations: IncidentRelations = { shift: null, site: null, crane: null }
      if (incident.shiftId) {
        const s = shiftById.get(incident.shiftId)
        if (s) relations.shift = { id: s.id, startedAt: s.startedAt, endedAt: s.endedAt }
      }
      if (incident.siteId) {
        const s = siteById.get(incident.siteId)
        if (s) relations.site = { id: s.id, name: s.name, address: s.address }
      }
      if (incident.craneId) {
        const c = craneById.get(incident.craneId)
        if (c) {
          relations.crane = {
            id: c.id,
            model: c.model,
            inventoryNumber: c.inventoryNumber,
            type: c.type as CraneType,
          }
        }
      }
      return { incident, photos, relations }
    })
  }

  async listMy(
    operatorUserId: string,
    params: ListMyParams,
  ): Promise<{ rows: IncidentWithRelations[]; nextCursor: string | null }> {
    const conds: SQL[] = [eq(incidents.reporterUserId, operatorUserId)]
    if (params.cursor) conds.push(lt(incidents.id, params.cursor))

    const rows = await this.database.db
      .select()
      .from(incidents)
      .where(and(...conds))
      .orderBy(desc(incidents.id))
      .limit(params.limit + 1)

    const hasMore = rows.length > params.limit
    const page = hasMore ? rows.slice(0, params.limit) : rows
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null

    const hydrated = await this.hydrateMany(page)
    return { rows: hydrated, nextCursor }
  }

  async listForOrg(
    params: ListOrgParams,
  ): Promise<{ rows: IncidentWithRelations[]; nextCursor: string | null }> {
    const conds: SQL[] = []
    if (this.ctx.role === 'owner') {
      conds.push(eq(incidents.organizationId, this.ctx.organizationId))
    }
    if (params.cursor) conds.push(lt(incidents.id, params.cursor))
    if (params.status) conds.push(eq(incidents.status, params.status))
    if (params.severity) conds.push(eq(incidents.severity, params.severity))
    if (params.type) conds.push(eq(incidents.type, params.type))
    if (params.siteId) conds.push(eq(incidents.siteId, params.siteId))
    if (params.craneId) conds.push(eq(incidents.craneId, params.craneId))

    const rows = await this.database.db
      .select()
      .from(incidents)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(incidents.id))
      .limit(params.limit + 1)

    const hasMore = rows.length > params.limit
    const page = hasMore ? rows.slice(0, params.limit) : rows
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null

    const hydrated = await this.hydrateMany(page)
    return { rows: hydrated, nextCursor }
  }

  /**
   * Counts для dashboard owner-stats:
   *   - pending: status IN ('submitted', 'acknowledged', 'escalated')
   *   - critical: same OR status filter + severity='critical' subset
   * organizationId — NULL when superadmin (но dashboard owner-stats всегда
   * вызывается со scope). Тут передаём explicit для clarity.
   */
  async countOpenForOrg(organizationId: string): Promise<{ open: number; critical: number }> {
    const OPEN_STATUSES: IncidentStatus[] = ['submitted', 'acknowledged', 'escalated']
    const openRow = (
      await this.database.db
        .select({ value: count() })
        .from(incidents)
        .where(
          and(
            eq(incidents.organizationId, organizationId),
            inArray(incidents.status, OPEN_STATUSES),
          ),
        )
    )[0]
    const criticalRow = (
      await this.database.db
        .select({ value: count() })
        .from(incidents)
        .where(
          and(
            eq(incidents.organizationId, organizationId),
            inArray(incidents.status, OPEN_STATUSES),
            eq(incidents.severity, 'critical'),
          ),
        )
    )[0]
    return {
      open: openRow ? Number(openRow.value) : 0,
      critical: criticalRow ? Number(criticalRow.value) : 0,
    }
  }

  async create(input: IncidentCreateInput, audit: AuditMeta): Promise<Incident> {
    return this.database.db.transaction(async (tx) => {
      const inserted = (
        await tx
          .insert(incidents)
          .values({
            reporterUserId: input.reporterUserId,
            reporterName: input.reporterName,
            reporterPhone: input.reporterPhone,
            organizationId: input.organizationId,
            shiftId: input.shiftId,
            siteId: input.siteId,
            craneId: input.craneId,
            type: input.type,
            severity: input.severity,
            status: 'submitted',
            description: input.description,
            latitude: input.latitude === null ? null : input.latitude.toString(),
            longitude: input.longitude === null ? null : input.longitude.toString(),
          })
          .returning()
      )[0]
      if (!inserted) throw new Error('incident insert returned no rows')

      if (input.photoKeys.length > 0) {
        await tx.insert(incidentPhotos).values(
          input.photoKeys.map((key) => ({
            incidentId: inserted.id,
            storageKey: key,
          })),
        )
      }

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'incident.create',
        targetType: 'incident',
        targetId: inserted.id,
        organizationId: inserted.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrateIncident(inserted)
    })
  }

  async acknowledge(id: string, audit: AuditMeta): Promise<Incident | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(incidents)
        .set({
          status: 'acknowledged',
          acknowledgedAt: new Date(),
          acknowledgedByUserId: audit.actorUserId,
          updatedAt: new Date(),
        })
        .where(and(eq(incidents.id, id), eq(incidents.status, 'submitted')))
        .returning()
      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'incident.acknowledge',
        targetType: 'incident',
        targetId: id,
        organizationId: row.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })
      return hydrateIncident(row)
    })
  }

  async resolve(id: string, notes: string | null, audit: AuditMeta): Promise<Incident | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(incidents)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedByUserId: audit.actorUserId,
          resolutionNotes: notes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(incidents.id, id),
            inArray(incidents.status, ['submitted', 'acknowledged', 'escalated']),
          ),
        )
        .returning()
      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'incident.resolve',
        targetType: 'incident',
        targetId: id,
        organizationId: row.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })
      return hydrateIncident(row)
    })
  }

  async escalate(id: string, audit: AuditMeta): Promise<Incident | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(incidents)
        .set({ status: 'escalated', updatedAt: new Date() })
        .where(and(eq(incidents.id, id), inArray(incidents.status, ['submitted', 'acknowledged'])))
        .returning()
      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'incident.escalate',
        targetType: 'incident',
        targetId: id,
        organizationId: row.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })
      return hydrateIncident(row)
    })
  }

  async deEscalate(id: string, audit: AuditMeta): Promise<Incident | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(incidents)
        .set({ status: 'acknowledged', updatedAt: new Date() })
        .where(and(eq(incidents.id, id), eq(incidents.status, 'escalated')))
        .returning()
      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'incident.de_escalate',
        targetType: 'incident',
        targetId: id,
        organizationId: row.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })
      return hydrateIncident(row)
    })
  }
}

/** Distinct non-null values, preserves first-seen order. */
function unique<T extends string>(values: Array<T | null>): T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const v of values) {
    if (v === null) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}
