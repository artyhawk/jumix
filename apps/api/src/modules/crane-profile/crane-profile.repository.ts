import type { AuthContext, UserRole } from '@jumix/auth'
import {
  type CraneProfile,
  type CraneProfileApprovalStatus,
  type DatabaseClient,
  type OrganizationOperator,
  auditLog,
  craneProfiles,
  organizationOperators,
  organizations,
  users,
} from '@jumix/db'
import { type SQL, and, asc, desc, eq, ilike, isNull, lt, or } from 'drizzle-orm'

/**
 * CraneProfileRepository — data access для crane-profiles-модуля (ADR 0003).
 *
 * Все reads фильтруют `deleted_at IS NULL`. Tenant scope:
 *   - superadmin: global (identity pool)
 *   - operator:   self-scope через ctx.userId (findByUserId*)
 *   - owner:      НЕ пользуется этим repo (его вход в крановщиков — через
 *                 organization-operators, где JOIN'ится identity данных)
 *
 * Mutations — в транзакции с audit_log (проектный инвариант). Approval-переходы
 * (approve/reject) мутируют ТОЛЬКО approval_status + timestamp/actor; identity
 * поля (ФИО/ИИН/specialization) не трогаются.
 */
export type AuditMeta = {
  actorUserId: string
  actorRole: UserRole
  ipAddress: string | null
  metadata: Record<string, unknown>
}

export type CraneProfileWithUser = { profile: CraneProfile; userPhone: string }

/**
 * Членство с nested organization name — используется в /me/status чтобы
 * мобилка могла показывать человеко-читаемые имена организаций в pending/
 * approved состоянии без второго round-trip'а (анти-N+1).
 */
export type MembershipWithOrganization = {
  hire: OrganizationOperator
  organizationName: string
}

type CraneProfileRow = typeof craneProfiles.$inferSelect

function hydrate(row: CraneProfileRow): CraneProfile {
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

export type CraneProfileUpdateFields = {
  firstName?: string
  lastName?: string
  patronymic?: string | null
  iin?: string
  specialization?: Record<string, unknown>
}

export type CraneProfileSelfUpdateFields = {
  firstName?: string
  lastName?: string
  patronymic?: string | null
}

export type ListCraneProfileApprovalFilter = CraneProfileApprovalStatus | 'all'

export class CraneProfileRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly ctx: AuthContext,
  ) {}

  /** Superadmin-only scope — owner не видит identity pool напрямую. */
  async findInScope(id: string): Promise<CraneProfile | null> {
    if (this.ctx.role !== 'superadmin') return null

    const rows = await this.database.db
      .select()
      .from(craneProfiles)
      .where(and(eq(craneProfiles.id, id), isNull(craneProfiles.deletedAt)))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  /** Post-write re-read (включая soft-deleted). */
  async findAnyById(id: string): Promise<CraneProfile | null> {
    const rows = await this.database.db
      .select()
      .from(craneProfiles)
      .where(eq(craneProfiles.id, id))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  /**
   * Self-scope lookup по user_id. deleted_at IS NULL — профили, помеченные
   * удалёнными, не видны даже владельцу (CLAUDE.md §4.2a: «deleted_at = полная
   * заморозка»).
   */
  async findByUserId(userId: string): Promise<CraneProfile | null> {
    const rows = await this.database.db
      .select()
      .from(craneProfiles)
      .where(and(eq(craneProfiles.userId, userId), isNull(craneProfiles.deletedAt)))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  async findByUserIdWithUser(userId: string): Promise<CraneProfileWithUser | null> {
    const rows = await this.database.db
      .select({ cp: craneProfiles, phone: users.phone })
      .from(craneProfiles)
      .innerJoin(users, eq(craneProfiles.userId, users.id))
      .where(and(eq(craneProfiles.userId, userId), isNull(craneProfiles.deletedAt)))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return { profile: hydrate(row.cp), userPhone: row.phone }
  }

  /**
   * Live-lookup по ИИН — глобальный scope (ADR 0003: iin globally unique).
   * Используется для conflict-detection в admin update / future register-flow.
   */
  async findActiveByIin(iin: string): Promise<CraneProfile | null> {
    const rows = await this.database.db
      .select()
      .from(craneProfiles)
      .where(and(eq(craneProfiles.iin, iin), isNull(craneProfiles.deletedAt)))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  async list(params: {
    cursor?: string
    limit: number
    search?: string
    approvalStatus: ListCraneProfileApprovalFilter
  }): Promise<{ rows: CraneProfile[]; nextCursor: string | null }> {
    if (this.ctx.role !== 'superadmin') return { rows: [], nextCursor: null }

    const conds: SQL[] = [isNull(craneProfiles.deletedAt)]
    if (params.cursor) conds.push(lt(craneProfiles.id, params.cursor))
    if (params.approvalStatus !== 'all') {
      conds.push(eq(craneProfiles.approvalStatus, params.approvalStatus))
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
      .select()
      .from(craneProfiles)
      .where(and(...conds))
      .orderBy(desc(craneProfiles.id))
      .limit(params.limit + 1)

    const hasMore = rows.length > params.limit
    const page = (hasMore ? rows.slice(0, params.limit) : rows).map(hydrate)
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null
    return { rows: page, nextCursor }
  }

  /**
   * Approval queue для superadmin'а — все pending-профили глобально,
   * created_at ASC (FIFO).
   */
  async listPending(params: { limit: number }): Promise<{ rows: CraneProfile[] }> {
    const rows = await this.database.db
      .select()
      .from(craneProfiles)
      .where(and(eq(craneProfiles.approvalStatus, 'pending'), isNull(craneProfiles.deletedAt)))
      .orderBy(asc(craneProfiles.createdAt))
      .limit(params.limit)
    return { rows: rows.map(hydrate) }
  }

  async listMembershipsForProfile(profileId: string): Promise<{ rows: OrganizationOperator[] }> {
    const rows = await this.database.db
      .select()
      .from(organizationOperators)
      .where(
        and(
          eq(organizationOperators.craneProfileId, profileId),
          isNull(organizationOperators.deletedAt),
        ),
      )
      .orderBy(desc(organizationOperators.createdAt))
    return { rows: rows as OrganizationOperator[] }
  }

  /**
   * Same scope что `listMembershipsForProfile`, но JOIN'ит `organizations.name`.
   * Для /me/status: клиент хочет показать «ТОО Кран-15 — pending» а не UUID.
   * Deleted_at IS NULL на обеих сторонах — soft-deleted orgs / hire'ы не
   * всплывают.
   */
  async listMembershipsForProfileWithOrg(
    profileId: string,
  ): Promise<{ rows: MembershipWithOrganization[] }> {
    const rows = await this.database.db
      .select({ hire: organizationOperators, organizationName: organizations.name })
      .from(organizationOperators)
      .innerJoin(organizations, eq(organizationOperators.organizationId, organizations.id))
      .where(
        and(
          eq(organizationOperators.craneProfileId, profileId),
          isNull(organizationOperators.deletedAt),
        ),
      )
      .orderBy(desc(organizationOperators.createdAt))

    return {
      rows: rows.map((row) => ({
        hire: row.hire as OrganizationOperator,
        organizationName: row.organizationName,
      })),
    }
  }

  async updateFields(
    id: string,
    patch: CraneProfileUpdateFields,
    audit: AuditMeta,
  ): Promise<CraneProfile | null> {
    return this.database.db.transaction(async (tx) => {
      const set: Record<string, unknown> = { updatedAt: new Date() }
      if (patch.firstName !== undefined) set.firstName = patch.firstName
      if (patch.lastName !== undefined) set.lastName = patch.lastName
      if (patch.patronymic !== undefined) set.patronymic = patch.patronymic
      if (patch.iin !== undefined) set.iin = patch.iin
      if (patch.specialization !== undefined) set.specialization = patch.specialization

      const rows = await tx
        .update(craneProfiles)
        .set(set)
        .where(and(eq(craneProfiles.id, id), isNull(craneProfiles.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane_profile.update',
        targetType: 'crane_profile',
        targetId: id,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async updateSelfFields(
    id: string,
    patch: CraneProfileSelfUpdateFields,
    audit: AuditMeta,
  ): Promise<CraneProfile | null> {
    return this.database.db.transaction(async (tx) => {
      const set: Record<string, unknown> = { updatedAt: new Date() }
      if (patch.firstName !== undefined) set.firstName = patch.firstName
      if (patch.lastName !== undefined) set.lastName = patch.lastName
      if (patch.patronymic !== undefined) set.patronymic = patch.patronymic

      const rows = await tx
        .update(craneProfiles)
        .set(set)
        .where(and(eq(craneProfiles.id, id), isNull(craneProfiles.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane_profile.self_update',
        targetType: 'crane_profile',
        targetId: id,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async setAvatarKey(id: string, key: string, audit: AuditMeta): Promise<CraneProfile | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(craneProfiles)
        .set({ avatarKey: key, updatedAt: new Date() })
        .where(and(eq(craneProfiles.id, id), isNull(craneProfiles.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane_profile.avatar.set',
        targetType: 'crane_profile',
        targetId: id,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async clearAvatarKey(id: string, audit: AuditMeta): Promise<CraneProfile | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(craneProfiles)
        .set({ avatarKey: null, updatedAt: new Date() })
        .where(and(eq(craneProfiles.id, id), isNull(craneProfiles.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane_profile.avatar.clear',
        targetType: 'crane_profile',
        targetId: id,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async softDelete(id: string, audit: AuditMeta): Promise<CraneProfile | null> {
    return this.database.db.transaction(async (tx) => {
      const now = new Date()
      const rows = await tx
        .update(craneProfiles)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(craneProfiles.id, id), isNull(craneProfiles.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane_profile.delete',
        targetType: 'crane_profile',
        targetId: id,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async approve(id: string, audit: AuditMeta): Promise<CraneProfile | null> {
    return this.database.db.transaction(async (tx) => {
      const now = new Date()
      const rows = await tx
        .update(craneProfiles)
        .set({
          approvalStatus: 'approved',
          approvedByUserId: audit.actorUserId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(craneProfiles.id, id),
            eq(craneProfiles.approvalStatus, 'pending'),
            isNull(craneProfiles.deletedAt),
          ),
        )
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane_profile.approve',
        targetType: 'crane_profile',
        targetId: id,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async reject(id: string, reason: string, audit: AuditMeta): Promise<CraneProfile | null> {
    return this.database.db.transaction(async (tx) => {
      const now = new Date()
      const rows = await tx
        .update(craneProfiles)
        .set({
          approvalStatus: 'rejected',
          rejectedByUserId: audit.actorUserId,
          rejectedAt: now,
          rejectionReason: reason,
          updatedAt: now,
        })
        .where(
          and(
            eq(craneProfiles.id, id),
            eq(craneProfiles.approvalStatus, 'pending'),
            isNull(craneProfiles.deletedAt),
          ),
        )
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'crane_profile.reject',
        targetType: 'crane_profile',
        targetId: id,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }
}
