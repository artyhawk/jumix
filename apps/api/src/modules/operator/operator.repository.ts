import type { AuthContext, UserRole } from '@jumix/auth'
import {
  type DatabaseClient,
  type Operator,
  type OperatorAvailability,
  type OperatorStatus,
  auditLog,
  operators,
  users,
} from '@jumix/db'
import { type SQL, and, desc, eq, ilike, isNull, lt, or } from 'drizzle-orm'

/**
 * OperatorRepository — data access с tenant scope через AuthContext
 * (CLAUDE.md §4.2 Layer 3).
 *
 * Reads:
 *   - findInScope — owner/superadmin; soft-deleted игнорируется.
 *   - findByUserId — self-scope lookup по user_id, БЕЗ org-check: operator
 *     знает свой organizationId внутри записи. Caller (service) проверит
 *     canReadSelf до вызова.
 *   - findAnyById — service-internal, включая soft-deleted.
 *   - findActiveByIin — conflict-detection перед create/update, игнорирует
 *     soft-deleted (слот освобождается).
 *   - list — cursor-based, DESC по id; owner → своя org; superadmin → все;
 *     operator → пусто.
 *
 * Mutations: ВСЕ в транзакции с audit_log (инвариант проекта — нет мутации
 * без аудита). setStatus принимает status И terminated_at как явные аргументы
 * — service решает что именно записать (сохранение исторической даты).
 *
 * `findInScopeWithUser` / `findByUserIdWithUser` — JOIN с users для DTO
 * generation (phone живёт в users, operator его не дублирует).
 */
export type AuditMeta = {
  actorUserId: string
  actorRole: UserRole
  ipAddress: string | null
  metadata: Record<string, unknown>
}

type OperatorRow = typeof operators.$inferSelect

function hydrate(row: OperatorRow): Operator {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    firstName: row.firstName,
    lastName: row.lastName,
    patronymic: row.patronymic,
    iin: row.iin,
    avatarKey: row.avatarKey,
    hiredAt: row.hiredAt,
    terminatedAt: row.terminatedAt,
    specialization: (row.specialization ?? {}) as Record<string, unknown>,
    status: row.status as OperatorStatus,
    availability: row.availability as OperatorAvailability | null,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export type OperatorCreateInput = {
  userId: string
  organizationId: string
  firstName: string
  lastName: string
  patronymic: string | null
  iin: string
  hiredAt: Date | null
  specialization: Record<string, unknown>
}

export type OperatorUpdateFields = {
  firstName?: string
  lastName?: string
  patronymic?: string | null
  iin?: string
  hiredAt?: Date | null
  terminatedAt?: Date | null
  specialization?: Record<string, unknown>
}

export type OperatorSelfUpdateFields = {
  firstName?: string
  lastName?: string
  patronymic?: string | null
}

export type UserCreateForOperator = {
  phone: string
  organizationId: string
  name: string
}

export type OperatorWithUser = { operator: Operator; userPhone: string }

export class OperatorRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly ctx: AuthContext,
  ) {}

  async findInScope(id: string): Promise<Operator | null> {
    if (this.ctx.role === 'operator') return null

    const conds: SQL[] = [eq(operators.id, id), isNull(operators.deletedAt)]
    if (this.ctx.role === 'owner') {
      conds.push(eq(operators.organizationId, this.ctx.organizationId))
    }

    const rows = await this.database.db
      .select()
      .from(operators)
      .where(and(...conds))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  async findInScopeWithUser(id: string): Promise<OperatorWithUser | null> {
    if (this.ctx.role === 'operator') return null

    const conds: SQL[] = [eq(operators.id, id), isNull(operators.deletedAt)]
    if (this.ctx.role === 'owner') {
      conds.push(eq(operators.organizationId, this.ctx.organizationId))
    }

    const rows = await this.database.db
      .select({ op: operators, phone: users.phone })
      .from(operators)
      .innerJoin(users, eq(operators.userId, users.id))
      .where(and(...conds))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return { operator: hydrate(row.op), userPhone: row.phone }
  }

  /** Self-scope: поиск operator'а по user_id. Не фильтруется ctx'ом —
   *  policy.canReadSelf вызывается в service до. Игнорирует soft-deleted. */
  async findByUserId(userId: string): Promise<Operator | null> {
    const rows = await this.database.db
      .select()
      .from(operators)
      .where(and(eq(operators.userId, userId), isNull(operators.deletedAt)))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  async findByUserIdWithUser(userId: string): Promise<OperatorWithUser | null> {
    const rows = await this.database.db
      .select({ op: operators, phone: users.phone })
      .from(operators)
      .innerJoin(users, eq(operators.userId, users.id))
      .where(and(eq(operators.userId, userId), isNull(operators.deletedAt)))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return { operator: hydrate(row.op), userPhone: row.phone }
  }

  async findAnyById(id: string): Promise<Operator | null> {
    const rows = await this.database.db
      .select()
      .from(operators)
      .where(eq(operators.id, id))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  async findActiveByIin(organizationId: string, iin: string): Promise<Operator | null> {
    const rows = await this.database.db
      .select()
      .from(operators)
      .where(
        and(
          eq(operators.organizationId, organizationId),
          eq(operators.iin, iin),
          isNull(operators.deletedAt),
        ),
      )
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  async list(params: {
    cursor?: string
    limit: number
    search?: string
    status?: OperatorStatus
  }): Promise<{ rows: Operator[]; nextCursor: string | null }> {
    if (this.ctx.role === 'operator') return { rows: [], nextCursor: null }

    const conds: SQL[] = [isNull(operators.deletedAt)]
    if (this.ctx.role === 'owner') {
      conds.push(eq(operators.organizationId, this.ctx.organizationId))
    }
    if (params.cursor) conds.push(lt(operators.id, params.cursor))
    if (params.status) conds.push(eq(operators.status, params.status))
    if (params.search) {
      const needle = `%${params.search}%`
      const match = or(
        ilike(operators.firstName, needle),
        ilike(operators.lastName, needle),
        ilike(operators.iin, needle),
      )
      if (match) conds.push(match)
    }

    const rows = await this.database.db
      .select()
      .from(operators)
      .where(and(...conds))
      .orderBy(desc(operators.id))
      .limit(params.limit + 1)

    const hasMore = rows.length > params.limit
    const page = (hasMore ? rows.slice(0, params.limit) : rows).map(hydrate)
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null
    return { rows: page, nextCursor }
  }

  /**
   * Атомарный create: user + operator в одной транзакции + audit.
   * Если operator insert падает (дубликат ИИН), user rollback'ается.
   * Возвращает operator + phone (phone на users, нужен для DTO).
   */
  async createUserAndOperator(
    user: UserCreateForOperator,
    operator: Omit<OperatorCreateInput, 'userId'>,
    audit: AuditMeta,
  ): Promise<OperatorWithUser> {
    return this.database.db.transaction(async (tx) => {
      const userRows = await tx
        .insert(users)
        .values({
          role: 'operator',
          organizationId: user.organizationId,
          phone: user.phone,
          name: user.name,
        })
        .returning()
      const insertedUser = userRows[0]
      if (!insertedUser) throw new Error('user insert returned no rows')

      const opRows = await tx
        .insert(operators)
        .values({
          userId: insertedUser.id,
          organizationId: operator.organizationId,
          firstName: operator.firstName,
          lastName: operator.lastName,
          patronymic: operator.patronymic,
          iin: operator.iin,
          hiredAt: operator.hiredAt,
          specialization: operator.specialization,
        })
        .returning()
      const insertedOp = opRows[0]
      if (!insertedOp) throw new Error('operator insert returned no rows')

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'operator.create',
        targetType: 'operator',
        targetId: insertedOp.id,
        organizationId: insertedOp.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return { operator: hydrate(insertedOp), userPhone: insertedUser.phone }
    })
  }

  async updateFields(
    id: string,
    organizationId: string,
    patch: OperatorUpdateFields,
    audit: AuditMeta,
  ): Promise<Operator | null> {
    return this.database.db.transaction(async (tx) => {
      const set: Record<string, unknown> = { updatedAt: new Date() }
      if (patch.firstName !== undefined) set.firstName = patch.firstName
      if (patch.lastName !== undefined) set.lastName = patch.lastName
      if (patch.patronymic !== undefined) set.patronymic = patch.patronymic
      if (patch.iin !== undefined) set.iin = patch.iin
      if (patch.hiredAt !== undefined) set.hiredAt = patch.hiredAt
      if (patch.terminatedAt !== undefined) set.terminatedAt = patch.terminatedAt
      if (patch.specialization !== undefined) set.specialization = patch.specialization

      const rows = await tx
        .update(operators)
        .set(set)
        .where(and(eq(operators.id, id), isNull(operators.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'operator.update',
        targetType: 'operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async updateSelfFields(
    id: string,
    organizationId: string,
    patch: OperatorSelfUpdateFields,
    audit: AuditMeta,
  ): Promise<Operator | null> {
    return this.database.db.transaction(async (tx) => {
      const set: Record<string, unknown> = { updatedAt: new Date() }
      if (patch.firstName !== undefined) set.firstName = patch.firstName
      if (patch.lastName !== undefined) set.lastName = patch.lastName
      if (patch.patronymic !== undefined) set.patronymic = patch.patronymic

      const rows = await tx
        .update(operators)
        .set(set)
        .where(and(eq(operators.id, id), isNull(operators.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'operator.self_update',
        targetType: 'operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  /**
   * setStatus: service передаёт status + terminated_at явно.
   * repo просто пишет что передали — historical-record логика принадлежит
   * service'у, НЕ repo (см. JSDoc сервиса).
   */
  async setStatus(
    id: string,
    organizationId: string,
    status: OperatorStatus,
    terminatedAt: Date | null,
    audit: AuditMeta,
  ): Promise<Operator | null> {
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
        .update(operators)
        .set(set)
        .where(and(eq(operators.id, id), isNull(operators.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: `operator.${statusAction(status)}`,
        targetType: 'operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async setAvatarKey(
    id: string,
    organizationId: string,
    key: string,
    audit: AuditMeta,
  ): Promise<Operator | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(operators)
        .set({ avatarKey: key, updatedAt: new Date() })
        .where(and(eq(operators.id, id), isNull(operators.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'operator.avatar.set',
        targetType: 'operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async clearAvatarKey(
    id: string,
    organizationId: string,
    audit: AuditMeta,
  ): Promise<Operator | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(operators)
        .set({ avatarKey: null, updatedAt: new Date() })
        .where(and(eq(operators.id, id), isNull(operators.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'operator.avatar.clear',
        targetType: 'operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }

  async softDelete(id: string, organizationId: string, audit: AuditMeta): Promise<Operator | null> {
    return this.database.db.transaction(async (tx) => {
      const now = new Date()
      const rows = await tx
        .update(operators)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(operators.id, id), isNull(operators.deletedAt)))
        .returning()

      const row = rows[0]
      if (!row) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'operator.delete',
        targetType: 'operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate(row)
    })
  }
}

function statusAction(status: OperatorStatus): string {
  if (status === 'active') return 'activate'
  if (status === 'blocked') return 'block'
  return 'terminate'
}
