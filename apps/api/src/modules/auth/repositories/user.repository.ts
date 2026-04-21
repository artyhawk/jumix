import type { DatabaseClient, User } from '@jumix/db'
import { organizations, users } from '@jumix/db'
import { and, eq, isNull, sql } from 'drizzle-orm'

export type UserWithOrgStatus = User & {
  organizationStatus: 'active' | 'suspended' | 'archived' | null
}

/**
 * UserRepository — data access по таблице `users`.
 *
 * Здесь НЕ делаем tenant-scoping: auth-lookup'ы по id/phone — контекстно
 * аутентификационные операции, они предшествуют построению AuthContext.
 * Обычные business-list'ы пользователей (операторы и т.д.) должны идти
 * через отдельные репозитории с обязательным AuthContext (CLAUDE.md §4.2).
 */
export class UserRepository {
  constructor(private readonly database: DatabaseClient) {}

  /**
   * Ищет пользователя по id + присоединяет статус организации одним SQL'ом.
   * Используется в authenticate-middleware: после проверки подписи JWT нам
   * нужно одним round-trip'ом достать и tokenVersion/status/deleted_at
   * пользователя, и status его организации.
   *
   * Возвращает `null` если пользователь не найден.
   */
  async findByIdWithOrganization(userId: string): Promise<UserWithOrgStatus | null> {
    const rows = await this.database.db
      .select({
        user: users,
        organizationStatus: organizations.status,
      })
      .from(users)
      .leftJoin(organizations, eq(users.organizationId, organizations.id))
      .where(eq(users.id, userId))
      .limit(1)

    const row = rows[0]
    if (!row) return null
    return { ...row.user, organizationStatus: row.organizationStatus }
  }

  /**
   * Ищет активного (не удалённого) пользователя по телефону. Для login-flow.
   * `deleted_at IS NULL` — удалённые пользователи не могут залогиниться
   * даже если знают пароль.
   */
  async findActiveByPhone(phone: string): Promise<User | null> {
    const rows = await this.database.db
      .select()
      .from(users)
      .where(and(eq(users.phone, phone), isNull(users.deletedAt)))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Ищет ЛЮБОГО пользователя по телефону, игнорируя `deleted_at` и `status`.
   * Используется при создании организации (и любой регистрации) для
   * обнаружения phone-конфликта до INSERT: соболезную soft-deleted user'у,
   * он всё равно держит уникальный phone по constraint'у, и попытка создать
   * нового с тем же номером упадёт 23505. Вернуть 409 до INSERT'а чище.
   */
  async findAnyByPhone(phone: string): Promise<User | null> {
    const rows = await this.database.db.select().from(users).where(eq(users.phone, phone)).limit(1)
    return rows[0] ?? null
  }

  /**
   * Атомарный bump tokenVersion. Вызывается при logout-all и при успешном
   * password reset — обесценивает все ранее выданные access-токены (§5.5).
   * Возвращает новое значение tokenVersion, либо null если пользователя нет.
   */
  async incrementTokenVersion(userId: string): Promise<number | null> {
    const rows = await this.database.db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ tokenVersion: users.tokenVersion })
    return rows[0]?.tokenVersion ?? null
  }

  async updateLastLogin(userId: string, at: Date): Promise<void> {
    await this.database.db
      .update(users)
      .set({ lastLoginAt: at, updatedAt: at })
      .where(eq(users.id, userId))
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.database.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
  }
}
