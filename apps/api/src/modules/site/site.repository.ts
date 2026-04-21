import type { AuthContext, UserRole } from '@jumix/auth'
import { type DatabaseClient, type Site, type SiteStatus, auditLog } from '@jumix/db'
import { type SQL, sql } from 'drizzle-orm'
import { round6 } from '../../lib/coords'
import type { UpdateSiteInput } from './site.schemas'

/**
 * SiteRepository — data access с tenant scope через AuthContext (CLAUDE.md §4.2
 * Layer 3).
 *
 * Почему raw SQL вместо Drizzle-builder'а: geofence_center — GEOGRAPHY(Point,
 * 4326), PostGIS-тип. Drizzle нативно его не типизирует; любые операции
 * (ST_MakePoint при insert, ST_X/ST_Y при select) требуют sql-фрагментов.
 * Поэтому все CRUD-методы для sites идут через `db.execute(sql\`...\`)`.
 *
 * Mutations (create/updateFields/setStatus) оборачиваются в `db.transaction`
 * вместе с записью в audit_log — тот же инвариант, что и OrganizationRepository:
 * не может остаться мутация без аудита, если audit-insert падает откатываем
 * всё.
 *
 * Все reads (findInScope, findAnyById, list) возвращают null/пустой список для
 * ctx вне scope — не 403 (§4.3 «404 вместо 403»).
 */
export type AuditMeta = {
  actorUserId: string
  actorRole: UserRole
  ipAddress: string | null
  metadata: Record<string, unknown>
}

/**
 * Общий SELECT-фрагмент. Hydrate latitude/longitude из geofence_center через
 * cast в geometry (PostGIS ST_X/ST_Y берут geometry-аргумент). Кавычки вокруг
 * alias нужны чтобы postgres-js не опустил случай (camelCase сохраняется).
 */
const SITE_SELECT: SQL = sql`
  id,
  organization_id AS "organizationId",
  name,
  address,
  ST_Y(geofence_center::geometry) AS latitude,
  ST_X(geofence_center::geometry) AS longitude,
  geofence_radius_m AS "geofenceRadiusM",
  status,
  notes,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`

type RawSiteRow = {
  id: string
  organizationId: string
  name: string
  address: string | null
  latitude: number | string
  longitude: number | string
  geofenceRadiusM: number
  status: SiteStatus
  notes: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

/**
 * Hydrate row из raw `db.execute(sql\`...\`)`:
 *   - ST_X/ST_Y PostGIS могут вернуться как string (double-как-текст) при
 *     определённых client-конфигах postgres-js → Number + round6 (§7.1);
 *   - timestamptz через raw execute НЕ проходит через drizzle column-decoder
 *     (в отличие от `.select()`), поэтому postgres-js отдаёт ISO-строку —
 *     приводим к Date вручную.
 */
function hydrateSite(row: RawSiteRow): Site {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    address: row.address,
    latitude: round6(typeof row.latitude === 'string' ? Number(row.latitude) : row.latitude),
    longitude: round6(typeof row.longitude === 'string' ? Number(row.longitude) : row.longitude),
    geofenceRadiusM: row.geofenceRadiusM,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  }
}

export class SiteRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly ctx: AuthContext,
  ) {}

  /** Чтение с tenant scope — возвращает null если site не в scope ctx. */
  async findInScope(id: string): Promise<Site | null> {
    if (this.ctx.role === 'operator') return null

    const scopeFilter =
      this.ctx.role === 'owner' ? sql`AND organization_id = ${this.ctx.organizationId}` : sql``

    const rows = (await this.database.db.execute(sql`
      SELECT ${SITE_SELECT}
      FROM sites
      WHERE id = ${id}
      ${scopeFilter}
      LIMIT 1
    `)) as unknown as RawSiteRow[]

    const first = rows[0]
    return first ? hydrateSite(first) : null
  }

  /**
   * Не-скопленный lookup. Используется service для post-mutation re-read когда
   * policy уже подтвердила доступ (например, superadmin обновил чужой site).
   */
  async findAnyById(id: string): Promise<Site | null> {
    const rows = (await this.database.db.execute(sql`
      SELECT ${SITE_SELECT}
      FROM sites
      WHERE id = ${id}
      LIMIT 1
    `)) as unknown as RawSiteRow[]
    const first = rows[0]
    return first ? hydrateSite(first) : null
  }

  async list(params: {
    cursor?: string
    limit: number
    search?: string
    status?: SiteStatus
  }): Promise<{ rows: Site[]; nextCursor: string | null }> {
    if (this.ctx.role === 'operator') return { rows: [], nextCursor: null }

    const conditions: SQL[] = []
    if (this.ctx.role === 'owner') {
      conditions.push(sql`organization_id = ${this.ctx.organizationId}`)
    }
    if (params.cursor) conditions.push(sql`id < ${params.cursor}`)
    if (params.status) conditions.push(sql`status = ${params.status}`)
    if (params.search) {
      const needle = `%${params.search}%`
      conditions.push(sql`(name ILIKE ${needle} OR address ILIKE ${needle})`)
    }

    const whereClause =
      conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``

    const rawRows = (await this.database.db.execute(sql`
      SELECT ${SITE_SELECT}
      FROM sites
      ${whereClause}
      ORDER BY id DESC
      LIMIT ${params.limit + 1}
    `)) as unknown as RawSiteRow[]

    const hasMore = rawRows.length > params.limit
    const page = (hasMore ? rawRows.slice(0, params.limit) : rawRows).map(hydrateSite)
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null
    return { rows: page, nextCursor }
  }

  async create(
    input: {
      organizationId: string
      name: string
      address: string | null
      latitude: number
      longitude: number
      radiusM: number
      notes: string | null
    },
    audit: AuditMeta,
  ): Promise<Site> {
    return this.database.db.transaction(async (tx) => {
      const rawRows = (await tx.execute(sql`
        INSERT INTO sites (
          organization_id, name, address,
          geofence_center, geofence_radius_m, notes
        ) VALUES (
          ${input.organizationId},
          ${input.name},
          ${input.address},
          ST_MakePoint(${input.longitude}, ${input.latitude})::geography,
          ${input.radiusM},
          ${input.notes}
        )
        RETURNING ${SITE_SELECT}
      `)) as unknown as RawSiteRow[]

      const site = rawRows[0]
      if (!site) throw new Error('site insert returned no rows')

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'site.create',
        targetType: 'site',
        targetId: site.id,
        organizationId: site.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrateSite(site)
    })
  }

  async updateFields(
    id: string,
    organizationId: string,
    patch: UpdateSiteInput,
    audit: AuditMeta,
  ): Promise<Site | null> {
    return this.database.db.transaction(async (tx) => {
      const setParts: SQL[] = []
      if (patch.name !== undefined) setParts.push(sql`name = ${patch.name}`)
      if (patch.address !== undefined) setParts.push(sql`address = ${patch.address}`)
      if (patch.radiusM !== undefined) setParts.push(sql`geofence_radius_m = ${patch.radiusM}`)
      if (patch.notes !== undefined) setParts.push(sql`notes = ${patch.notes}`)
      // lat+lng всегда приходят парой (zod refine), проверено выше.
      if (patch.latitude !== undefined && patch.longitude !== undefined) {
        setParts.push(
          sql`geofence_center = ST_MakePoint(${patch.longitude}, ${patch.latitude})::geography`,
        )
      }
      setParts.push(sql`updated_at = now()`)

      const rawRows = (await tx.execute(sql`
        UPDATE sites
        SET ${sql.join(setParts, sql`, `)}
        WHERE id = ${id}
        RETURNING ${SITE_SELECT}
      `)) as unknown as RawSiteRow[]

      const row = rawRows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'site.update',
        targetType: 'site',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrateSite(row)
    })
  }

  async setStatus(
    id: string,
    organizationId: string,
    status: SiteStatus,
    audit: AuditMeta,
  ): Promise<Site | null> {
    return this.database.db.transaction(async (tx) => {
      const rawRows = (await tx.execute(sql`
        UPDATE sites
        SET status = ${status}, updated_at = now()
        WHERE id = ${id}
        RETURNING ${SITE_SELECT}
      `)) as unknown as RawSiteRow[]

      const row = rawRows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: `site.${statusAction(status)}`,
        targetType: 'site',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrateSite(row)
    })
  }
}

function statusAction(status: SiteStatus): string {
  if (status === 'active') return 'activate'
  if (status === 'completed') return 'complete'
  return 'archive'
}
