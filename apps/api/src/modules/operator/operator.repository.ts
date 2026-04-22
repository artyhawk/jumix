import type { AuthContext, UserRole } from '@jumix/auth'
import {
  type DatabaseClient,
  type Operator,
  type OperatorAvailability,
  type OperatorStatus,
  auditLog,
  craneProfiles,
  organizationOperators,
  users,
} from '@jumix/db'
import { type SQL, and, desc, eq, ilike, isNull, lt, or } from 'drizzle-orm'

/**
 * OperatorRepository — data access для operator-модуля.
 *
 * ### B2d-1 compat-shim (ADR 0003)
 *
 * Таблица `operators` разделена на `crane_profiles` (global identity) +
 * `organization_operators` (M:N membership). Этот repo продолжает отдавать
 * единый hydrated `Operator` shape наверх — service/routes/tests модифицировать
 * массово нецелесообразно внутри одного коммита. Чтение — INNER JOIN между
 * двумя таблицами; мутации, затрагивающие оба сегмента (updateFields,
 * softDelete), — две UPDATE в одной транзакции.
 *
 * Все записи, создаваемые шимом, сразу `approval_status='approved'` в обеих
 * таблицах. Реальный approval-workflow (два pipeline'а из ADR 0003) приходит
 * в B2d-3 отдельным модулем; тогда create будет создавать pending и шим
 * уйдёт вместе с этим файлом.
 *
 * Assumptions шима (валидны, пока не появится B2d-2 multi-org path):
 *   - один user → ровно один crane_profile → ровно одна organization_operator;
 *   - soft-delete operator'а soft-delete'ит ОБЕ строки (иначе iin/user_id
 *     unique-slot'ы остаются занятыми, recreate падает).
 *
 * Reads:
 *   - findInScope — owner/superadmin; soft-deleted игнорируется.
 *   - findByUserId — self-scope lookup по user_id → первый (и, пока шим,
 *     единственный) живой hire. B2d-2 заменит первый-живой на hire,
 *     выбранный X-Organization-Id header'ом.
 *   - findAnyById — service-internal, включая soft-deleted.
 *   - findActiveByIin — conflict-detection перед create/update в пределах
 *     одной org (legacy semantics; в post-B2d-3 iin будет global-scope).
 *   - list — cursor-based, DESC по organization_operators.id.
 *
 * Mutations: все в транзакции с audit_log (проектный инвариант).
 * setStatus принимает status + terminated_at как явные аргументы — service
 * решает что записать (сохранение исторической даты при восстановлении).
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

function hydrate(row: JoinedRow): Operator {
  return {
    id: row.oo.id,
    userId: row.cp.userId,
    organizationId: row.oo.organizationId,
    firstName: row.cp.firstName,
    lastName: row.cp.lastName,
    patronymic: row.cp.patronymic,
    iin: row.cp.iin,
    avatarKey: row.cp.avatarKey,
    hiredAt: row.oo.hiredAt,
    terminatedAt: row.oo.terminatedAt,
    specialization: (row.cp.specialization ?? {}) as Record<string, unknown>,
    status: row.oo.status as OperatorStatus,
    availability: row.oo.availability as OperatorAvailability | null,
    deletedAt: row.oo.deletedAt,
    createdAt: row.oo.createdAt,
    updatedAt: row.oo.updatedAt,
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

  async findInScopeWithUser(id: string): Promise<OperatorWithUser | null> {
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
    return { operator: hydrate({ oo: row.oo, cp: row.cp }), userPhone: row.phone }
  }

  /**
   * Self-scope lookup по user_id.
   *
   * TODO B2d-2: когда один user сможет иметь несколько active hire'ов, эта
   * логика «первый живой» превращается в «выбери hire по X-Organization-Id
   * header из request». Пока шим — один user ↔ один crane_profile ↔ один
   * live hire, «первый» == «единственный».
   */
  async findByUserId(userId: string): Promise<Operator | null> {
    const rows = await this.database.db
      .select({ oo: organizationOperators, cp: craneProfiles })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .where(
        and(
          eq(craneProfiles.userId, userId),
          isNull(organizationOperators.deletedAt),
          isNull(craneProfiles.deletedAt),
        ),
      )
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  async findByUserIdWithUser(userId: string): Promise<OperatorWithUser | null> {
    const rows = await this.database.db
      .select({ oo: organizationOperators, cp: craneProfiles, phone: users.phone })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .innerJoin(users, eq(craneProfiles.userId, users.id))
      .where(
        and(
          eq(craneProfiles.userId, userId),
          isNull(organizationOperators.deletedAt),
          isNull(craneProfiles.deletedAt),
        ),
      )
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return { operator: hydrate({ oo: row.oo, cp: row.cp }), userPhone: row.phone }
  }

  async findAnyById(id: string): Promise<Operator | null> {
    // Без фильтра deletedAt — нужен и для soft-deleted. crane_profile
    // в шиме soft-delete'ится синхронно с organization_operator (см. softDelete).
    const rows = await this.database.db
      .select({ oo: organizationOperators, cp: craneProfiles })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .where(eq(organizationOperators.id, id))
      .limit(1)
    return rows[0] ? hydrate(rows[0]) : null
  }

  /**
   * B2d-1 (ADR 0003): iin теперь глобально уникален среди живых crane_profiles.
   * `organizationId` оставлен в сигнатуре для минимального diff'а в service'е
   * и игнорируется. Если нужен первый живой hire для найденного профиля —
   * берём его же (для legacy shape с organizationId). Если профиль живой, но
   * ни одного живого hire нет — возвращаем null, т.к. legacy Operator шейп
   * требует organizationId.
   */
  async findActiveByIin(_organizationId: string, iin: string): Promise<Operator | null> {
    const rows = await this.database.db
      .select({ oo: organizationOperators, cp: craneProfiles })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .where(
        and(
          eq(craneProfiles.iin, iin),
          isNull(organizationOperators.deletedAt),
          isNull(craneProfiles.deletedAt),
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

    const conds: SQL[] = [isNull(organizationOperators.deletedAt), isNull(craneProfiles.deletedAt)]
    if (this.ctx.role === 'owner') {
      conds.push(eq(organizationOperators.organizationId, this.ctx.organizationId))
    }
    if (params.cursor) conds.push(lt(organizationOperators.id, params.cursor))
    if (params.status) conds.push(eq(organizationOperators.status, params.status))
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
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null
    return { rows: page, nextCursor }
  }

  /**
   * Атомарный create: user + crane_profile + organization_operator + audit.
   * Если любой insert падает (дубликат phone/iin), всё rollback'ается.
   *
   * Compat-shim (ADR 0003 / B2d-1): обе approval-строки создаются сразу
   * `approved` — owner в этой ветке создаёт готового к работе оператора
   * бесшовно. B2d-3 заменит это на pending + superadmin approve-flow.
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

      const now = new Date()

      const cpRows = await tx
        .insert(craneProfiles)
        .values({
          userId: insertedUser.id,
          firstName: operator.firstName,
          lastName: operator.lastName,
          patronymic: operator.patronymic,
          iin: operator.iin,
          specialization: operator.specialization,
          approvalStatus: 'approved',
          approvedAt: now,
        })
        .returning()
      const insertedCp = cpRows[0]
      if (!insertedCp) throw new Error('crane_profile insert returned no rows')

      const ooRows = await tx
        .insert(organizationOperators)
        .values({
          craneProfileId: insertedCp.id,
          organizationId: operator.organizationId,
          hiredAt: operator.hiredAt,
          approvalStatus: 'approved',
          approvedAt: now,
        })
        .returning()
      const insertedOo = ooRows[0]
      if (!insertedOo) throw new Error('organization_operator insert returned no rows')

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'operator.create',
        targetType: 'operator',
        targetId: insertedOo.id,
        organizationId: insertedOo.organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return {
        operator: hydrate({ oo: insertedOo, cp: insertedCp }),
        userPhone: insertedUser.phone,
      }
    })
  }

  async updateFields(
    id: string,
    organizationId: string,
    patch: OperatorUpdateFields,
    audit: AuditMeta,
  ): Promise<Operator | null> {
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

      const now = new Date()
      const cpSet: Record<string, unknown> = {}
      const ooSet: Record<string, unknown> = {}
      if (patch.firstName !== undefined) cpSet.firstName = patch.firstName
      if (patch.lastName !== undefined) cpSet.lastName = patch.lastName
      if (patch.patronymic !== undefined) cpSet.patronymic = patch.patronymic
      if (patch.iin !== undefined) cpSet.iin = patch.iin
      if (patch.specialization !== undefined) cpSet.specialization = patch.specialization
      if (patch.hiredAt !== undefined) ooSet.hiredAt = patch.hiredAt
      if (patch.terminatedAt !== undefined) ooSet.terminatedAt = patch.terminatedAt

      if (Object.keys(cpSet).length > 0) {
        cpSet.updatedAt = now
        await tx.update(craneProfiles).set(cpSet).where(eq(craneProfiles.id, existingRow.cp.id))
      }
      // Всегда bump'аем organization_operators.updatedAt — legacy-форма
      // `Operator.updatedAt` маппится именно на это поле, тесты полагаются.
      ooSet.updatedAt = now
      await tx.update(organizationOperators).set(ooSet).where(eq(organizationOperators.id, id))

      const updated = await tx
        .select({ oo: organizationOperators, cp: craneProfiles })
        .from(organizationOperators)
        .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
        .where(eq(organizationOperators.id, id))
        .limit(1)
      const updatedRow = updated[0]
      if (!updatedRow) return null

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

      return hydrate(updatedRow)
    })
  }

  async updateSelfFields(
    id: string,
    organizationId: string,
    patch: OperatorSelfUpdateFields,
    audit: AuditMeta,
  ): Promise<Operator | null> {
    return this.database.db.transaction(async (tx) => {
      const existing = await tx
        .select({ oo: organizationOperators, cp: craneProfiles })
        .from(organizationOperators)
        .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
        .where(
          and(
            eq(organizationOperators.id, id),
            isNull(organizationOperators.deletedAt),
            isNull(craneProfiles.deletedAt),
          ),
        )
        .limit(1)
      const existingRow = existing[0]
      if (!existingRow) return null

      const now = new Date()
      const cpSet: Record<string, unknown> = { updatedAt: now }
      if (patch.firstName !== undefined) cpSet.firstName = patch.firstName
      if (patch.lastName !== undefined) cpSet.lastName = patch.lastName
      if (patch.patronymic !== undefined) cpSet.patronymic = patch.patronymic

      await tx.update(craneProfiles).set(cpSet).where(eq(craneProfiles.id, existingRow.cp.id))
      // Зеркалируем updatedAt на hire-строке, чтобы hydrated.updatedAt двигался.
      await tx
        .update(organizationOperators)
        .set({ updatedAt: now })
        .where(eq(organizationOperators.id, id))

      const updated = await tx
        .select({ oo: organizationOperators, cp: craneProfiles })
        .from(organizationOperators)
        .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
        .where(eq(organizationOperators.id, id))
        .limit(1)
      const updatedRow = updated[0]
      if (!updatedRow) return null

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

      return hydrate(updatedRow)
    })
  }

  /**
   * setStatus: service передаёт status + terminated_at явно. Затрагивает
   * только organization_operators — crane_profile остаётся как есть
   * (платформенный профиль не «терминируется» при увольнении из одной дочки).
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
        action: `operator.${statusAction(status)}`,
        targetType: 'operator',
        targetId: id,
        organizationId,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return hydrate({ oo: row, cp: cpRow })
    })
  }

  async setAvatarKey(
    id: string,
    organizationId: string,
    key: string,
    audit: AuditMeta,
  ): Promise<Operator | null> {
    return this.database.db.transaction(async (tx) => {
      const existing = await tx
        .select({ oo: organizationOperators, cp: craneProfiles })
        .from(organizationOperators)
        .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
        .where(
          and(
            eq(organizationOperators.id, id),
            isNull(organizationOperators.deletedAt),
            isNull(craneProfiles.deletedAt),
          ),
        )
        .limit(1)
      const existingRow = existing[0]
      if (!existingRow) return null

      const now = new Date()
      await tx
        .update(craneProfiles)
        .set({ avatarKey: key, updatedAt: now })
        .where(eq(craneProfiles.id, existingRow.cp.id))
      await tx
        .update(organizationOperators)
        .set({ updatedAt: now })
        .where(eq(organizationOperators.id, id))

      const updated = await tx
        .select({ oo: organizationOperators, cp: craneProfiles })
        .from(organizationOperators)
        .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
        .where(eq(organizationOperators.id, id))
        .limit(1)
      const updatedRow = updated[0]
      if (!updatedRow) return null

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

      return hydrate(updatedRow)
    })
  }

  async clearAvatarKey(
    id: string,
    organizationId: string,
    audit: AuditMeta,
  ): Promise<Operator | null> {
    return this.database.db.transaction(async (tx) => {
      const existing = await tx
        .select({ oo: organizationOperators, cp: craneProfiles })
        .from(organizationOperators)
        .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
        .where(
          and(
            eq(organizationOperators.id, id),
            isNull(organizationOperators.deletedAt),
            isNull(craneProfiles.deletedAt),
          ),
        )
        .limit(1)
      const existingRow = existing[0]
      if (!existingRow) return null

      const now = new Date()
      await tx
        .update(craneProfiles)
        .set({ avatarKey: null, updatedAt: now })
        .where(eq(craneProfiles.id, existingRow.cp.id))
      await tx
        .update(organizationOperators)
        .set({ updatedAt: now })
        .where(eq(organizationOperators.id, id))

      const updated = await tx
        .select({ oo: organizationOperators, cp: craneProfiles })
        .from(organizationOperators)
        .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
        .where(eq(organizationOperators.id, id))
        .limit(1)
      const updatedRow = updated[0]
      if (!updatedRow) return null

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

      return hydrate(updatedRow)
    })
  }

  /**
   * softDelete шимит legacy-семантику: обе таблицы помечаются deleted_at'ом
   * в одной транзакции. Причины:
   *   - iin на crane_profiles уникален среди живых → если оставить профиль,
   *     recreate с тем же ИИН упадёт (B2b ожидает освобождение слота);
   *   - user_id на crane_profiles тоже уникален среди живых → нужно освободить
   *     (хотя createUserAndOperator всегда берёт свежего user'а, но это
   *     «broad strokes» гарантия).
   *
   * B2d-2+: когда один crane_profile начнёт иметь несколько hire'ов,
   * softDelete должен трогать только ту organization_operator, которую
   * удаляют. Профиль остаётся (он — платформенный). До того момента —
   * шим грубый, но согласованный с B2b-тестами.
   */
  async softDelete(id: string, organizationId: string, audit: AuditMeta): Promise<Operator | null> {
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

      const now = new Date()
      await tx
        .update(organizationOperators)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(organizationOperators.id, id))
      await tx
        .update(craneProfiles)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(craneProfiles.id, existingRow.cp.id))

      const updated = await tx
        .select({ oo: organizationOperators, cp: craneProfiles })
        .from(organizationOperators)
        .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
        .where(eq(organizationOperators.id, id))
        .limit(1)
      const updatedRow = updated[0]
      if (!updatedRow) return null

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

      return hydrate(updatedRow)
    })
  }
}

function statusAction(status: OperatorStatus): string {
  if (status === 'active') return 'activate'
  if (status === 'blocked') return 'block'
  return 'terminate'
}
