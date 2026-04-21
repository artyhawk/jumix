import type { AuthContext, UserRole } from '@jumix/auth'
import type { DatabaseClient, NewOrganization, NewUser, Organization, User } from '@jumix/db'
import { auditLog, organizations, users } from '@jumix/db'
import { and, desc, eq, ilike, lt, or } from 'drizzle-orm'

/**
 * OrganizationRepository — data access с автоматическим tenant scope'ом
 * через AuthContext (CLAUDE.md §4.2 Layer 3).
 *
 * Правило для read-запросов: `findInScope` / `listForSuperadmin` возвращают
 * null/пусто если ctx не имеет доступа — не 403. Соответствует §4.3:
 * «404 вместо 403 для скрытия существования ресурсов».
 *
 * Mutations (`createOrganizationWithOwner`, `updateFields`, `setStatus`)
 * записывают audit-событие **в той же транзакции**, что и изменение. Это
 * гарантирует: не может остаться «немого» мутирования без аудита (если
 * audit-insert падает — откатываем и основную мутацию).
 *
 * `findByBin` и `findAnyById` — service-internal lookups для conflict-detection /
 * post-mutation re-read, НЕ скопятся. Service вызывает только после policy check.
 */
export type AuditMeta = {
  actorUserId: string
  actorRole: UserRole
  ipAddress: string | null
  metadata: Record<string, unknown>
}

export class OrganizationRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly ctx: AuthContext,
  ) {}

  async findInScope(id: string): Promise<Organization | null> {
    if (this.ctx.role === 'operator') return null
    if (this.ctx.role === 'owner' && this.ctx.organizationId !== id) return null

    const rows = await this.database.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Список организаций. Cursor = last seen id (ORDER BY id DESC) —
   * стабильный детерминированный порядок. Limit+1 читается чтобы понять
   * есть ли `nextCursor`. Если ctx не superadmin — пусто.
   */
  async listForSuperadmin(params: {
    cursor?: string
    limit: number
    search?: string
    status?: Organization['status']
  }): Promise<{ rows: Organization[]; nextCursor: string | null }> {
    if (this.ctx.role !== 'superadmin') return { rows: [], nextCursor: null }

    const filters = [] as Parameters<typeof and>
    if (params.cursor) filters.push(lt(organizations.id, params.cursor))
    if (params.status) filters.push(eq(organizations.status, params.status))
    if (params.search) {
      const needle = `%${params.search}%`
      const match = or(ilike(organizations.name, needle), ilike(organizations.bin, needle))
      if (match) filters.push(match)
    }
    const whereClause = filters.length > 0 ? and(...filters) : undefined

    const rows = await this.database.db
      .select()
      .from(organizations)
      .where(whereClause)
      .orderBy(desc(organizations.id))
      .limit(params.limit + 1)

    const hasMore = rows.length > params.limit
    const page = hasMore ? rows.slice(0, params.limit) : rows
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null
    return { rows: page, nextCursor }
  }

  /** Глобальный lookup по BIN. Service использует для 409 до инсерта. */
  async findByBin(bin: string): Promise<Organization | null> {
    const rows = await this.database.db
      .select()
      .from(organizations)
      .where(eq(organizations.bin, bin))
      .limit(1)
    return rows[0] ?? null
  }

  /** Не-скопленный lookup для service (post-write re-read, etc). */
  async findAnyById(id: string): Promise<Organization | null> {
    const rows = await this.database.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async createOrganizationWithOwner(
    input: {
      organization: Pick<
        NewOrganization,
        'name' | 'bin' | 'contactName' | 'contactPhone' | 'contactEmail'
      >
      owner: Pick<NewUser, 'phone' | 'name'>
    },
    audit: AuditMeta,
  ): Promise<{ organization: Organization; owner: User }> {
    return this.database.db.transaction(async (tx) => {
      const orgRows = await tx.insert(organizations).values(input.organization).returning()
      const organization = orgRows[0]
      if (!organization) throw new Error('organization insert returned no rows')

      const userRows = await tx
        .insert(users)
        .values({
          role: 'owner',
          organizationId: organization.id,
          phone: input.owner.phone,
          name: input.owner.name,
        })
        .returning()
      const owner = userRows[0]
      if (!owner) throw new Error('owner insert returned no rows')

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'organization.create',
        targetType: 'organization',
        targetId: organization.id,
        organizationId: organization.id,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return { organization, owner }
    })
  }

  async updateFields(
    id: string,
    patch: Partial<
      Pick<Organization, 'name' | 'bin' | 'contactName' | 'contactPhone' | 'contactEmail'>
    >,
    audit: AuditMeta,
  ): Promise<Organization | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(organizations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(organizations.id, id))
        .returning()
      const updated = rows[0] ?? null
      if (!updated) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: 'organization.update',
        targetType: 'organization',
        targetId: id,
        organizationId: id,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return updated
    })
  }

  async setStatus(
    id: string,
    status: Organization['status'],
    audit: AuditMeta,
  ): Promise<Organization | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(organizations)
        .set({ status, updatedAt: new Date() })
        .where(eq(organizations.id, id))
        .returning()
      const updated = rows[0] ?? null
      if (!updated) return null

      await tx.insert(auditLog).values({
        actorUserId: audit.actorUserId,
        actorRole: audit.actorRole,
        action: `organization.${status === 'active' ? 'activate' : status === 'suspended' ? 'suspend' : 'archive'}`,
        targetType: 'organization',
        targetId: id,
        organizationId: id,
        metadata: audit.metadata,
        ipAddress: audit.ipAddress,
      })

      return updated
    })
  }
}
