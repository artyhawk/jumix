import { sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { customType, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

// inet и bytea не имеют прямых шорткатов в drizzle — используем customType
const inet = customType<{ data: string }>({
  dataType: () => 'inet',
})

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // SHA-256 от plain токена (мы храним только хэш — §5.1)
    tokenHash: bytea().notNull(),
    deviceId: text(),
    ipAddress: inet(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true, mode: 'date' }),
    expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp({ withTimezone: true, mode: 'date' }),
    // 'rotation' | 'logout' | 'logout_all' | 'reuse_detected' | 'admin_revoke'
    revokedReason: text(),
    // Для rotation chain: указывает на новый токен, выданный взамен (§5.1)
    replacedBy: uuid().references((): AnyPgColumn => refreshTokens.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_key').on(t.tokenHash),
    // Индексы из CLAUDE.md §6.7 — только активные (WHERE revoked_at IS NULL)
    index('refresh_tokens_user_active_idx')
      .on(t.userId)
      .where(sql`revoked_at IS NULL`),
    index('refresh_tokens_expires_idx').on(t.expiresAt),
  ],
)

export type RefreshToken = typeof refreshTokens.$inferSelect
export type NewRefreshToken = typeof refreshTokens.$inferInsert
