import {
  boolean,
  customType,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { authEventTypeEnum } from './enums'
import { users } from './users'

const inet = customType<{ data: string }>({ dataType: () => 'inet' })

export const authEvents = pgTable(
  'auth_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Может быть NULL: failed login по несуществующему phone, SMS-запрос до identification
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    eventType: authEventTypeEnum().notNull(),
    phone: text(),
    ipAddress: inet(),
    userAgent: text(),
    success: boolean().notNull(),
    failureReason: text(),
    metadata: jsonb().notNull().default({}),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_events_user_time_idx').on(t.userId, t.createdAt),
    // Для rate-limit lookup'ов по phone и IP (§5.3)
    index('auth_events_phone_time_idx').on(t.phone, t.createdAt),
    index('auth_events_ip_time_idx').on(t.ipAddress, t.createdAt),
    index('auth_events_type_time_idx').on(t.eventType, t.createdAt),
  ],
)

export type AuthEvent = typeof authEvents.$inferSelect
export type NewAuthEvent = typeof authEvents.$inferInsert
