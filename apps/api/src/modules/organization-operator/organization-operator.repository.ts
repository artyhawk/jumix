import type { AuthContext, UserRole } from '@jumix/auth'
import {
  type CraneProfile,
  type CraneProfileApprovalStatus,
  type DatabaseClient,
  type OperatorAvailability,
  type OperatorStatus,
  type OrganizationOperator,
  type OrganizationOperatorApprovalStatus,
  auditLog,
  craneProfiles,
  organizationOperators,
  users,
} from '@jumix/db'
import { type SQL, and, desc, eq, ilike, isNull, lt, or } from 'drizzle-orm'

/**
 * OrganizationOperatorRepository — data access для hire-записей холдинга
 * (ADR 0003, authorization.md §4.2b/§4.2c).
 *
 * Идентичность живёт на `crane_profiles`; здесь — M:N membership
 * `(crane_profile_id, organization_id)` с operational полями (hired_at /
 * terminated_at / status / availability) и approval-gate (pipeline 2).
 *
 * Вся identity (ФИО, ИИН, avatar, specialization) read'ается JOIN'ом с
 * crane_profiles и отдаётся наверх в едином «hydrated» shape
 * `HydratedOrganizationOperator`. Это нужно для DTO с вложенным
 * `craneProfile` — UI списка найма показывает имя без дополнительного
 * N+1 запроса.
 *
 * Mutations — всегда в транзакции с audit_log (проектный инвариант).
 * softDelete трогает ТОЛЬКО organization_operator — crane_profile остаётся
 * жить, т.к. тот же человек может быть перенанят в эту или другую дочку
 * (ADR 0003). Identity-fields (ФИО/ИИН) мутируются отдельно через
 * crane-profile модуль.
 *
 * Approval-mutation'ы (approve/reject) ограничены `approval_status='pending'`
 * в WHERE — race-safe: повторный вызов вернёт null, service увидит это и
 * пересчитает actual state для 409-ответа.
 */
export type AuditMeta = {
  actorUserId: string
  actorRole: UserRole
  ipAddress: string | null
  metadata: Record<string, unknown>
}

type JoinedRow = {
  oo: typeof organizationOperators.$inferSelect
  cp: typeof craneProfiles.$inferSelect
}

export type HydratedOrganizationOperator = {
  hire: OrganizationOperator
  profile: CraneProfile
}

export type HydratedOrganizationOperatorWithUser = HydratedOrganizationOperator & {
  userPhone: string
}

function hydrateHire(row: typeof organizationOperators.$inferSelect): OrganizationOperator {
  return {
    id: row.id,
    craneProfileId: row.craneProfileId,
    organizationId: row.organizationId,
    hiredAt: row.hiredAt,
    terminatedAt: row.terminatedAt,
    status: row.status as OperatorStatus,
    availability: row.availability as OperatorAvailability | null,
    approvalStatus: row.approvalStatus as OrganizationOperatorApprovalStatus,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    rejectedByUserId: row.rejectedByUserId,
    rejectedAt: row.rejectedAt,
    rejectionReason: row.rejectionReason,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function hydrateProfile(row: typeof craneProfiles.$inferSelect): CraneProfile {
  return {
    id: row.id,
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    patronymic: row.patronymic,
    iin: row.iin,
    avatarKey: row.avatarKey,
    specialization: (row.specialization ?? {}) as Record<string, unknown>,
    approvalStatus: row.approvalStatus as CraneProfileApprovalStatus,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    rejectedByUserId: row.rejectedByUserId,
    rejectedAt: row.rejectedAt,
    rejectionReason: row.rejectionReason,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function hydrate(row: JoinedRow): HydratedOrganizationOperator {
  return { hire: hydrateHire(row.oo), profile: hydrateProfile(row.cp) }
}

export type HireInput = {
  craneProfileId: string
  organizationId: string
  hiredAt: Date | null
}

export type HireUpdateFields = {
  hiredAt?: Date | null
}

export type ListApprovalFilter = OrganizationOperatorApprovalStatus | 'all'

export class OrganizationOperatorRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly ctx: AuthContext,
  ) {}

  async findInScope(id: string): Promise<HydratedOrganizationOperator | null> {
    if (this.ctx.role === 'operator') return null

    const conds: SQL[] = [
      eq(organizationOperators.id, id),
      isNull(organizationOperators.deletedAt),
      isNull(craneProfiles.deletedAt),
    ]
    if (this.ctx.role === 'owner') {
      conds.push(eq(organizationOperators.organizationId, this.ctx.organizationId))
    }

    const rows = await this.database.db
      .select({ oo: organizationOperators, cp: craneProfiles })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .where(and(...conds))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  async findInScopeWithUser(id: string): Promise<HydratedOrganizationOperatorWithUser | null> {
    if (this.ctx.role === 'operator') return null

    const conds: SQL[] = [
      eq(organizationOperators.id, id),
      isNull(organizationOperators.deletedAt),
      isNull(craneProfiles.deletedAt),
    ]
    if (this.ctx.role === 'owner') {
      conds.push(eq(organizationOperators.organizationId, this.ctx.organizationId))
    }

    const rows = await this.database.db
      .select({ oo: organizationOperators, cp: craneProfiles, phone: users.phone })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .innerJoin(users, eq(craneProfiles.userId, users.id))
      .where(and(...conds))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return { ...hydrate({ oo: row.oo, cp: row.cp }), userPhone: row.phone }
  }

  /** Post-write re-read (включая soft-deleted и без scope). Для race-check. */
  async findAnyById(id: string): Promise<HydratedOrganizationOperator | null> {
    const rows = await this.database.db
      .select({ oo: organizationOperators, cp: craneProfiles })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .where(eq(organizationOperators.id, id))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  /** Platform-scoped live lookup по (craneProfileId, organizationId). Conflict-detection. */
  async findActiveByProfileAndOrg(
    craneProfileId: string,
    organizationId: string,
  ): Promise<OrganizationOperator | null> {
    const rows = await this.database.db
      .select()
      .from(organizationOperators)
      .where(
        and(
          eq(organizationOperators.craneProfileId, craneProfileId),
          eq(organizationOperators.organizationId, organizationId),
          isNull(organizationOperators.deletedAt),
        ),
      )
      .limit(1)
    return rows[0] ? hydrateHire(rows[0]) : null
  }

  async findCraneProfileForHire(craneProfileId: string): Promise<CraneProfile | null> {
    const rows = await this.database.db
      .select()
      .from(craneProfiles)
      .where(and(eq(craneProfiles.id, craneProfileId), isNull(craneProfiles.deletedAt)))
      .limit(1)
    return rows[0] ? hydrateProfile(rows[0]) : null
  }

  async list(params: {
    cursor?: string
    limit: number
    search?: string
    status?: OperatorStatus
    approvalStatus: ListApprovalFilter
    craneProfileId?: string
    organizationId?: string
  }): Promise<{ rows: HydratedOrganizationOperator[]; nextCursor: string | null }> {
    if (this.ctx.role === 'operator') return { rows: [], nextCursor: null }

    const conds: SQL[] = [isNull(organizationOperators.deletedAt), isNull(craneProfiles.deletedAt)]
    if (this.ctx.role === 'owner') {
      conds.push(eq(organizationOperators.organizationId, this.ctx.organizationId))
    } else if (params.organizationId) {
      // superadmin: optional narrow-down filter.
      conds.push(eq(organizationOperators.organizationId, params.organizationId))
    }
    if (params.cursor) conds.push(lt(organizationOperators.id, params.cursor))
    if (params.status) conds.push(eq(organizationOperators.status, params.status))
    if (params.approvalStatus !== 'all') {
      conds.push(eq(organizationOperators.approvalStatus, params.approvalStatus))
    }
    if (params.craneProfileId) {
      conds.push(eq(organizationOperators.craneProfileId, params.craneProfileId))
    }
    if (params.search) {
      const needle = `%${params.search}%`
      const match = or(
        ilike(craneProfiles.firstName, needle),
        ilike(craneProfiles.lastName, needle),
        ilike(craneProfiles.iin, needle),
      )
      if (match) conds.push(match)
    }

    const rows = await this.database.db
      .select({ oo: organizationOperators, cp: craneProfiles })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .where(and(...conds))
      .orderBy(desc(organizationOperators.id))
      .limit(params.limit + 1)

    const hasMore = rows.length > params.limit
    const page = (hasMore ? rows.slice(0, params.limit) : rows).map(hydrate)
    const nextCursor = hasMore ? (page.at(-1)?.hire.id ?? null) : null
    return { rows: page, nextCursor }
  }

  /**
   * Создаёт pending organization_operator (pipeline 2) для указанного
   * crane_profile. Profile approved-state проверяется в service'е (и DB
   * partial UNIQUE страхует повторный найм). Audit action='organization_operator.submit'.
   */
  async hire(input: HireInput, audit: AuditMeta): Promise<HydratedOrganizationOperator | null> {
    return this.database.db.transaction(async (tx) => {
      const cpRows = await tx
        .select()
        .from(craneProfiles)
        .where(and(eq(craneProfiles.id, input.craneProfileId), isNull(craneProfiles.deletedAt)))
        .limit(1)
      const cpRow = cpRows[0]
      if (!cpRow) return null

      const ooRows = await tx
        .insert(organizationOperators)
        .values({
          craneProfileId: input.craneProfileId,
          organizationId: input.organizationId,
          hiredAt: input.hiredAt,
          approvalStatus: 'pending',
        })
        .returning()
      const insertedOo = ooRows[0]
      if (!insertedOo) throw new Error('organization_operator insert returned no rows')

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'organization_operator.submit',
        targetType: 'organization_operator',
        targetId: insertedOo.id,
        organizationId: insertedOo.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate({ oo: insertedOo, cp: cpRow })
    })
  }

  async updateFields(
    id: string,
    organizationId: string,
    patch: HireUpdateFields,
    audit: AuditMeta,
  ): Promise<HydratedOrganizationOperator | null> {
    return this.database.db.transaction(async (tx) => {
      const existing = await tx
        .select({ oo: organizationOperators, cp: craneProfiles })
        .from(organizationOperators)
        .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
        .where(
          and(
            eq(organizationOperators.id, id),
            eq(organizationOperators.organizationId, organizationId),
            isNull(organizationOperators.deletedAt),
            isNull(craneProfiles.deletedAt),
          ),
        )
        .limit(1)
      const existingRow = existing[0]
      if (!existingRow) return null

      const set: Record<string, unknown> = { updatedAt: new Date() }
      if (patch.hiredAt !== undefined) set.hiredAt = patch.hiredAt

      const rows = await tx
        .update(organizationOperators)
        .set(set)
        .where(eq(organizationOperators.id, id))
        .returning()
      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'organization_operator.update',
        targetType: 'organization_operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate({ oo: row, cp: existingRow.cp })
    })
  }

  /**
   * setStatus затрагивает ТОЛЬКО organization_operators — crane_profile
   * остаётся как есть (платформенный профиль не «терминируется» при
   * увольнении из одной дочки). Service передаёт terminated_at явно.
   */
  async setStatus(
    id: string,
    organizationId: string,
    status: OperatorStatus,
    terminatedAt: Date | null,
    audit: AuditMeta,
  ): Promise<HydratedOrganizationOperator | null> {
    return this.database.db.transaction(async (tx) => {
      const set: Record<string, unknown> = {
        status,
        terminatedAt,
        updatedAt: new Date(),
      }
      // availability имеет смысл только для active; при blocked/terminated — обнуляем.
      if (status !== 'active') {
        set.availability = null
      }

      const rows = await tx
        .update(organizationOperators)
        .set(set)
        .where(and(eq(organizationOperators.id, id), isNull(organizationOperators.deletedAt)))
        .returning()
      const row = rows[0]
      if (!row) return null

      const cpRows = await tx
        .select()
        .from(craneProfiles)
        .where(and(eq(craneProfiles.id, row.craneProfileId), isNull(craneProfiles.deletedAt)))
        .limit(1)
      const cpRow = cpRows[0]
      if (!cpRow) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: `organization_operator.${statusAction(status)}`,
        targetType: 'organization_operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate({ oo: row, cp: cpRow })
    })
  }

  /**
   * softDelete затрагивает ТОЛЬКО hire-запись (ADR 0003). crane_profile
   * остаётся жить — один человек может быть перенанят в эту же дочку (после
   * освобождения UNIQUE-слота) или в другую.
   */
  async softDelete(
    id: string,
    organizationId: string,
    audit: AuditMeta,
  ): Promise<HydratedOrganizationOperator | null> {
    return this.database.db.transaction(async (tx) => {
      const existing = await tx
        .select({ oo: organizationOperators, cp: craneProfiles })
        .from(organizationOperators)
        .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
        .where(
          and(
            eq(organizationOperators.id, id),
            eq(organizationOperators.organizationId, organizationId),
            isNull(organizationOperators.deletedAt),
          ),
        )
        .limit(1)
      const existingRow = existing[0]
      if (!existingRow) return null

      const now = new Date()
      const rows = await tx
        .update(organizationOperators)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(organizationOperators.id, id))
        .returning()
      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'organization_operator.delete',
        targetType: 'organization_operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate({ oo: row, cp: existingRow.cp })
    })
  }

  async approve(
    id: string,
    organizationId: string,
    audit: AuditMeta,
  ): Promise<HydratedOrganizationOperator | null> {
    return this.database.db.transaction(async (tx) => {
      const now = new Date()
      const rows = await tx
        .update(organizationOperators)
        .set({
          approvalStatus: 'approved',
          approvedByUserId: audit.actorUserId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(organizationOperators.id, id),
            eq(organizationOperators.approvalStatus, 'pending'),
            isNull(organizationOperators.deletedAt),
          ),
        )
        .returning()
      const row = rows[0]
      if (!row) return null

      const cpRows = await tx
        .select()
        .from(craneProfiles)
        .where(and(eq(craneProfiles.id, row.craneProfileId), isNull(craneProfiles.deletedAt)))
        .limit(1)
      const cpRow = cpRows[0]
      if (!cpRow) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'organization_operator.approve',
        targetType: 'organization_operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate({ oo: row, cp: cpRow })
    })
  }

  async reject(
    id: string,
    organizationId: string,
    reason: string,
    audit: AuditMeta,
  ): Promise<HydratedOrganizationOperator | null> {
    return this.database.db.transaction(async (tx) => {
      const now = new Date()
      const rows = await tx
        .update(organizationOperators)
        .set({
          approvalStatus: 'rejected',
          rejectedByUserId: audit.actorUserId,
          rejectedAt: now,
          rejectionReason: reason,
          updatedAt: now,
        })
        .where(
          and(
            eq(organizationOperators.id, id),
            eq(organizationOperators.approvalStatus, 'pending'),
            isNull(organizationOperators.deletedAt),
          ),
        )
        .returning()
      const row = rows[0]
      if (!row) return null

      const cpRows = await tx
        .select()
        .from(craneProfiles)
        .where(and(eq(craneProfiles.id, row.craneProfileId), isNull(craneProfiles.deletedAt)))
        .limit(1)
      const cpRow = cpRows[0]
      if (!cpRow) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'organization_operator.reject',
        targetType: 'organization_operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate({ oo: row, cp: cpRow })
    })
  }
}

function statusAction(status: OperatorStatus): string {
  if (status === 'active') return 'activate'
  if (status === 'blocked') return 'block'
  return 'terminate'
}
