import type { AuthContext, UserRole } from '@jumix/auth'
import {
  type Crane,
  type CraneApprovalStatus,
  type CraneStatus,
  type CraneType,
  type DatabaseClient,
  auditLog,
  cranes,
} from '@jumix/db'
import { type SQL, and, asc, desc, eq, ilike, isNull, lt, or } from 'drizzle-orm'

/**
 * CraneRepository — data access с tenant scope через AuthContext
 * (CLAUDE.md §4.2 Layer 3).
 *
 * Все reads (`findInScope`, `list`) фильтруют по `deleted_at IS NULL`. Для
 * `superadmin` scope по организации отсутствует; `owner` читает только свою;
 * `operator` — пусто.
 *
 * Mutations (`create`, `updateFields`, `setStatus`, `softDelete`, `approve`,
 * `reject`) — в одной транзакции с audit-записью: инвариант «мутация без
 * аудита невозможна» (тот же паттерн, что у Site/Organization/Operator).
 *
 * Approval workflow (ADR 0002):
 *   - `create` устанавливает approval_status='pending', audit action='crane.submit'
 *   - `approve` / `reject` мутируют только approval_status + timestamp/actor;
 *     operational `status` не трогается
 *   - `updateFields` / `setStatus` НЕ могут менять approval_status (whitelist
 *     обеспечивается тем, что approval_status отсутствует в CraneUpdateFields)
 *
 * `findAnyById` и `findAnyByInventory` — service-internal lookups (post-write
 * re-read или conflict-detection), НЕ скопятся ctx'ом.
 */
export type AuditMeta = {
  actorUserId: string
  actorRole: UserRole
  ipAddress: string | null
  metadata: Record<string, unknown>
}

type CraneRow = typeof cranes.$inferSelect

/**
 * `numeric` через postgres-js возвращается строкой (sic — чтобы не терять
 * точность). Service отдаёт number'ы наверх; конвертим здесь.
 */
function hydrate(row: CraneRow): Crane {
  return {
    id: row.id,
    organizationId: row.organizationId,
    siteId: row.siteId,
    type: row.type as CraneType,
    model: row.model,
    inventoryNumber: row.inventoryNumber,
    capacityTon: Number(row.capacityTon),
    boomLengthM: row.boomLengthM === null ? null : Number(row.boomLengthM),
    yearManufactured: row.yearManufactured,
    tariffsJson: (row.tariffsJson ?? {}) as Record<string, unknown>,
    status: row.status as CraneStatus,
    approvalStatus: row.approvalStatus as CraneApprovalStatus,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    rejectedByUserId: row.rejectedByUserId,
    rejectedAt: row.rejectedAt,
    rejectionReason: row.rejectionReason,
    notes: row.notes,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export type CraneCreateInput = {
  organizationId: string
  siteId: string | null
  type: CraneType
  model: string
  inventoryNumber: string | null
  capacityTon: number
  boomLengthM: number | null
  yearManufactured: number | null
  tariffsJson: Record<string, unknown>
  notes: string | null
}

export type CraneUpdateFields = {
  type?: CraneType
  model?: string
  inventoryNumber?: string | null
  capacityTon?: number
  boomLengthM?: number | null
  yearManufactured?: number | null
  siteId?: string | null
  tariffsJson?: Record<string, unknown>
  notes?: string | null
}

export type CraneListApprovalFilter = CraneApprovalStatus | 'all'

export class CraneRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly ctx: AuthContext,
  ) {}

  /** Чтение с tenant scope — null если кран вне scope ctx или soft-deleted. */
  async findInScope(id: string): Promise<Crane | null> {
    if (this.ctx.role === 'operator') return null

    const conds: SQL[] = [eq(cranes.id, id), isNull(cranes.deletedAt)]
    if (this.ctx.role === 'owner') {
      conds.push(eq(cranes.organizationId, this.ctx.organizationId))
    }

    const rows = await this.database.db
      .select()
      .from(cranes)
      .where(and(...conds))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  /** Не-скопленный lookup по id (включая soft-deleted). Service post-write re-read. */
  async findAnyById(id: string): Promise<Crane | null> {
    const rows = await this.database.db.select().from(cranes).where(eq(cranes.id, id)).limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  /**
   * Live-lookup по (org, inventory_number) для pre-insert/pre-update
   * conflict-detection. Игнорирует soft-deleted (слот освобождается).
   */
  async findActiveByInventory(
    organizationId: string,
    inventoryNumber: string,
  ): Promise<Crane | null> {
    const rows = await this.database.db
      .select()
      .from(cranes)
      .where(
        and(
          eq(cranes.organizationId, organizationId),
          eq(cranes.inventoryNumber, inventoryNumber),
          isNull(cranes.deletedAt),
        ),
      )
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  async list(params: {
    cursor?: string
    limit: number
    search?: string
    status?: CraneStatus
    type?: CraneType
    siteId?: string
    organizationId?: string
    approvalStatus: CraneListApprovalFilter
  }): Promise<{ rows: Crane[]; nextCursor: string | null }> {
    if (this.ctx.role === 'operator') return { rows: [], nextCursor: null }

    const conds: SQL[] = [isNull(cranes.deletedAt)]
    if (this.ctx.role === 'owner') {
      conds.push(eq(cranes.organizationId, this.ctx.organizationId))
    } else if (params.organizationId) {
      conds.push(eq(cranes.organizationId, params.organizationId))
    }
    if (params.cursor) conds.push(lt(cranes.id, params.cursor))
    if (params.status) conds.push(eq(cranes.status, params.status))
    if (params.type) conds.push(eq(cranes.type, params.type))
    if (params.siteId) conds.push(eq(cranes.siteId, params.siteId))
    if (params.approvalStatus !== 'all') {
      conds.push(eq(cranes.approvalStatus, params.approvalStatus))
    }
    if (params.search) {
      const needle = `%${params.search}%`
      const match = or(ilike(cranes.model, needle), ilike(cranes.inventoryNumber, needle))
      if (match) conds.push(match)
    }

    const rows = await this.database.db
      .select()
      .from(cranes)
      .where(and(...conds))
      .orderBy(desc(cranes.id))
      .limit(params.limit + 1)

    const hasMore = rows.length > params.limit
    const page = (hasMore ? rows.slice(0, params.limit) : rows).map(hydrate)
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null
    return { rows: page, nextCursor }
  }

  /**
   * Approval queue для superadmin'а — все pending заявки глобально,
   * отсортированные по created_at ASC (старейшие сначала, FIFO).
   * Cursor формат отличается от list() — пока не реализован (approval queue
   * редко вырастает большой, за пределы limit=100 уходят редкие кейсы).
   * Когда понадобится — добавить created_at-based cursor.
   */
  async listPending(params: { limit: number }): Promise<{ rows: Crane[] }> {
    const rows = await this.database.db
      .select()
      .from(cranes)
      .where(and(eq(cranes.approvalStatus, 'pending'), isNull(cranes.deletedAt)))
      .orderBy(asc(cranes.createdAt))
      .limit(params.limit)
    return { rows: rows.map(hydrate) }
  }

  async create(input: CraneCreateInput, audit: AuditMeta): Promise<Crane> {
    return this.database.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(cranes)
        .values({
          organizationId: input.organizationId,
          siteId: input.siteId,
          type: input.type,
          model: input.model,
          inventoryNumber: input.inventoryNumber,
          // numeric ожидает string в insert — postgres драйвер примет и number,
          // но проще сериализовать явно (не теряем точность при float→numeric).
          capacityTon: input.capacityTon.toString(),
          boomLengthM: input.boomLengthM === null ? null : input.boomLengthM.toString(),
          yearManufactured: input.yearManufactured,
          tariffsJson: input.tariffsJson,
          notes: input.notes,
          // approvalStatus опускаем → default 'pending' из схемы.
        })
        .returning()

      const row = inserted[0]
      if (!row) throw new Error('crane insert returned no rows')

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane.submit',
        targetType: 'crane',
        targetId: row.id,
        organizationId: row.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async updateFields(
    id: string,
    organizationId: string,
    patch: CraneUpdateFields,
    audit: AuditMeta,
  ): Promise<Crane | null> {
    return this.database.db.transaction(async (tx) => {
      const set: Record<string, unknown> = { updatedAt: new Date() }
      if (patch.type !== undefined) set.type = patch.type
      if (patch.model !== undefined) set.model = patch.model
      if (patch.inventoryNumber !== undefined) set.inventoryNumber = patch.inventoryNumber
      if (patch.capacityTon !== undefined) set.capacityTon = patch.capacityTon.toString()
      if (patch.boomLengthM !== undefined) {
        set.boomLengthM = patch.boomLengthM === null ? null : patch.boomLengthM.toString()
      }
      if (patch.yearManufactured !== undefined) set.yearManufactured = patch.yearManufactured
      if (patch.siteId !== undefined) set.siteId = patch.siteId
      if (patch.tariffsJson !== undefined) set.tariffsJson = patch.tariffsJson
      if (patch.notes !== undefined) set.notes = patch.notes

      const rows = await tx
        .update(cranes)
        .set(set)
        .where(and(eq(cranes.id, id), isNull(cranes.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane.update',
        targetType: 'crane',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async setStatus(
    id: string,
    organizationId: string,
    status: CraneStatus,
    audit: AuditMeta,
  ): Promise<Crane | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(cranes)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(cranes.id, id), isNull(cranes.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: `crane.${statusAction(status)}`,
        targetType: 'crane',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async softDelete(id: string, organizationId: string, audit: AuditMeta): Promise<Crane | null> {
    return this.database.db.transaction(async (tx) => {
      const now = new Date()
      const rows = await tx
        .update(cranes)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(cranes.id, id), isNull(cranes.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane.delete',
        targetType: 'crane',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async approve(id: string, organizationId: string, audit: AuditMeta): Promise<Crane | null> {
    return this.database.db.transaction(async (tx) => {
      const now = new Date()
      const rows = await tx
        .update(cranes)
        .set({
          approvalStatus: 'approved',
          approvedByUserId: audit.actorUserId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(
          and(eq(cranes.id, id), eq(cranes.approvalStatus, 'pending'), isNull(cranes.deletedAt)),
        )
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane.approve',
        targetType: 'crane',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  /**
   * Assign approved crane к site (siteId set / clear). Отдельный метод вместо
   * updateFields — отдельный audit action (`crane.assign_to_site` /
   * `crane.unassign_from_site`) и более явная семантика для UI.
   */
  async assignSite(
    id: string,
    organizationId: string,
    siteId: string | null,
    audit: AuditMeta,
  ): Promise<Crane | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(cranes)
        .set({ siteId, updatedAt: new Date() })
        .where(and(eq(cranes.id, id), isNull(cranes.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      const action = siteId ? 'crane.assign_to_site' : 'crane.unassign_from_site'

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action,
        targetType: 'crane',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  /**
   * Resubmit rejected crane → pending. Сбрасываем rejected-state (timestamp/
   * actor/reason → null), preserved id/inventoryNumber. Audit `crane.resubmit`.
   */
  async resubmit(id: string, organizationId: string, audit: AuditMeta): Promise<Crane | null> {
    return this.database.db.transaction(async (tx) => {
      const now = new Date()
      const rows = await tx
        .update(cranes)
        .set({
          approvalStatus: 'pending',
          rejectedByUserId: null,
          rejectedAt: null,
          rejectionReason: null,
          updatedAt: now,
        })
        .where(
          and(eq(cranes.id, id), eq(cranes.approvalStatus, 'rejected'), isNull(cranes.deletedAt)),
        )
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane.resubmit',
        targetType: 'crane',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async reject(
    id: string,
    organizationId: string,
    reason: string,
    audit: AuditMeta,
  ): Promise<Crane | null> {
    return this.database.db.transaction(async (tx) => {
      const now = new Date()
      const rows = await tx
        .update(cranes)
        .set({
          approvalStatus: 'rejected',
          rejectedByUserId: audit.actorUserId,
          rejectedAt: now,
          rejectionReason: reason,
          updatedAt: now,
        })
        .where(
          and(eq(cranes.id, id), eq(cranes.approvalStatus, 'pending'), isNull(cranes.deletedAt)),
        )
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane.reject',
        targetType: 'crane',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }
}

function statusAction(status: CraneStatus): string {
  if (status === 'active') return 'activate'
  if (status === 'maintenance') return 'maintenance'
  return 'retire'
}
