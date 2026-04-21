import type { DatabaseClient, NewRefreshToken, RefreshToken } from '@jumix/db'
import { refreshTokens } from '@jumix/db'
import { and, eq, isNull } from 'drizzle-orm'

export type InsertRefreshTokenInput = Omit<NewRefreshToken, 'id' | 'createdAt'>

export type RevokeReason = 'rotation' | 'logout' | 'logout_all' | 'reuse_detected' | 'admin_revoke'

/**
 * RefreshTokenRepository — работа с таблицей `refresh_tokens` (§5.1, §5.4).
 *
 * Ключевые инварианты:
 *  - Храним только SHA-256 хэш токена (Buffer). Plain-токен живёт только
 *    в памяти в момент выдачи и возвращается клиенту один раз.
 *  - Lookup по `token_hash` с условием `revoked_at IS NULL`.
 *  - Rotation: старый токен маркируется revoked=rotation, replaced_by=newId.
 *  - Reuse detection: если клиент предъявляет уже revoked токен —
 *    вся цепочка (по replaced_by) отзывается с причиной `reuse_detected`.
 */
export class RefreshTokenRepository {
  constructor(private readonly database: DatabaseClient) {}

  async insert(input: InsertRefreshTokenInput): Promise<RefreshToken> {
    const rows = await this.database.db.insert(refreshTokens).values(input).returning()
    const row = rows[0]
    if (!row) throw new Error('refresh token insert returned no row')
    return row
  }

  /**
   * Ищет токен по hash независимо от revoked_at — caller'у нужна инфа
   * про revoked статус для reuse-detection. Возвращает null если хэш вообще
   * не существует (подделка / неправильная эпоха).
   */
  async findByHash(tokenHash: Buffer): Promise<RefreshToken | null> {
    const rows = await this.database.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Маркирует токен revoked с указанной причиной и replaced_by.
   * Idempotent: условие `revoked_at IS NULL` в WHERE — повторный revoke
   * того же токена не тронет уже проставленные revoked_at / reason /
   * replaced_by, сохраняя первое значение.
   */
  async revoke(
    id: string,
    reason: RevokeReason,
    replacedBy: string | null = null,
    at: Date = new Date(),
  ): Promise<void> {
    await this.database.db
      .update(refreshTokens)
      .set({ revokedAt: at, revokedReason: reason, replacedBy })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
  }

  /**
   * Отзывает все активные (ещё не revoked) refresh-токены пользователя.
   * Для logout-all и при password reset. Атомарная UPDATE WHERE.
   */
  async revokeAllForUser(
    userId: string,
    reason: RevokeReason,
    at: Date = new Date(),
  ): Promise<void> {
    await this.database.db
      .update(refreshTokens)
      .set({ revokedAt: at, revokedReason: reason })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
  }

  /**
   * Reuse-detection: найти все токены одной цепочки (по replaced_by),
   * начиная с указанного id и вверх (следующие). Отзывает их все.
   *
   * Алгоритм: транзитивно пройтись по replaced_by через рекурсивный CTE.
   * Если клиент предъявил токен, у которого revokedReason='rotation',
   * значит кто-то скопировал токен и использовал раньше легитимного клиента.
   *
   * COALESCE на revoked_at сохраняет первую метку для уже отозванных звеньев;
   * revoked_reason для всей цепочки перезаписывается в 'reuse_detected' —
   * это важнее, чем первоначальный reason 'rotation', т.к. сигнализирует
   * о компрометации, а не о штатной ротации.
   */
  async revokeChainFrom(id: string): Promise<void> {
    await this.database.sql`
      WITH RECURSIVE chain AS (
        SELECT id, replaced_by FROM refresh_tokens WHERE id = ${id}
        UNION ALL
        SELECT rt.id, rt.replaced_by
          FROM refresh_tokens rt
          JOIN chain c ON rt.id = c.replaced_by
      )
      UPDATE refresh_tokens
         SET revoked_at = COALESCE(revoked_at, now()),
             revoked_reason = 'reuse_detected'
       WHERE id IN (SELECT id FROM chain)
    `
  }
}
