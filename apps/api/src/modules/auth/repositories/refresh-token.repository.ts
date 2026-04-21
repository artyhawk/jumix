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
   * Lookup по id — нужен, чтобы сравнить контекст "победителя" ротации
   * с контекстом заново пришедшего запроса (rotation-race detection §5.1).
   * Возвращает полную запись независимо от revoked_at.
   */
  async findById(id: string): Promise<RefreshToken | null> {
    const rows = await this.database.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, id))
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
   *
   * Возвращает количество пройденных звеньев — пишется в audit metadata
   * для forensic-ревью инцидентов.
   */
  async revokeChainFrom(id: string): Promise<number> {
    const result = await this.database.sql`
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
       RETURNING id
    `
    return result.length
  }

  /**
   * Атомарная ротация refresh-токена (CAS + INSERT + UPDATE в одной
   * транзакции с row-lock на старом токене). Устраняет race при двух
   * параллельных /auth/refresh с одним презентованным токеном — типичный
   * сценарий на React Native wake-from-background.
   *
   * Алгоритм:
   *   1. BEGIN TX
   *   2. SELECT ... WHERE id = old AND revoked_at IS NULL FOR UPDATE
   *      — блокирует строку до коммита; параллельный запрос ждёт.
   *   3. Если строка не найдена (уже отозвана) → COMMIT, вернуть null
   *      (проигравшая сторона ничего не пишет).
   *   4. INSERT нового токена (RETURNING *)
   *   5. UPDATE старого: revoked_at = now(), reason = 'rotation',
   *      replaced_by = newId
   *   6. COMMIT
   *
   * Postgres гарантирует: из двух параллельных транзакций первая получит
   * lock, отроtирует, вторая дождётся COMMIT первой и увидит revoked_at
   * IS NOT NULL → SELECT FOR UPDATE вернёт 0 строк → null.
   */
  async rotateWithLock(
    oldId: string,
    newToken: InsertRefreshTokenInput,
  ): Promise<RefreshToken | null> {
    return await this.database.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: refreshTokens.id })
        .from(refreshTokens)
        .where(and(eq(refreshTokens.id, oldId), isNull(refreshTokens.revokedAt)))
        .for('update')
        .limit(1)
      if (existing.length === 0) return null

      const insertedRows = await tx.insert(refreshTokens).values(newToken).returning()
      const inserted = insertedRows[0]
      if (!inserted) throw new Error('refresh token insert returned no row')

      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), revokedReason: 'rotation', replacedBy: inserted.id })
        .where(eq(refreshTokens.id, oldId))

      return inserted
    })
  }
}
