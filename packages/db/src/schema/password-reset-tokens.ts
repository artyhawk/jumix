import { customType, index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' })

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: bytea().notNull(),
    expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp({ withTimezone: true, mode: 'date' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('password_reset_tokens_hash_key').on(t.tokenHash),
    index('password_reset_tokens_user_idx').on(t.userId),
  ],
)

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert
