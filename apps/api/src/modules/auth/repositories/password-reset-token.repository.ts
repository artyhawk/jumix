import type { DatabaseClient, NewPasswordResetToken, PasswordResetToken } from '@jumix/db'
import { passwordResetTokens } from '@jumix/db'
import { eq } from 'drizzle-orm'

export type InsertPasswordResetTokenInput = Omit<NewPasswordResetToken, 'id' | 'createdAt'>

/**
 * PasswordResetTokenRepository — одноразовые токены для сброса пароля (§5.4).
 *
 * Контракт: токен валиден ровно один раз. После markUsed() его нельзя
 * переиспользовать — caller должен проверить `used_at IS NULL` перед
 * применением нового пароля.
 */
export class PasswordResetTokenRepository {
  constructor(private readonly database: DatabaseClient) {}

  async insert(input: InsertPasswordResetTokenInput): Promise<PasswordResetToken> {
    const rows = await this.database.db.insert(passwordResetTokens).values(input).returning()
    const row = rows[0]
    if (!row) throw new Error('password reset token insert returned no row')
    return row
  }

  async findByHash(tokenHash: Buffer): Promise<PasswordResetToken | null> {
    const rows = await this.database.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1)
    return rows[0] ?? null
  }

  async markUsed(id: string, at: Date = new Date()): Promise<void> {
    await this.database.db
      .update(passwordResetTokens)
      .set({ usedAt: at })
      .where(eq(passwordResetTokens.id, id))
  }
}
