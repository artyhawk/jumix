import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { userRoleEnum } from './enums'
import { organizations } from './organizations'

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    // +7XXXXXXXXXX — нормализованный формат KZ
    phone: text().notNull(),
    // argon2id-хэш. Nullable: пользователь может входить только по SMS
    passwordHash: text(),
    role: userRoleEnum().notNull(),
    // null только для superadmin (см. check constraint ниже)
    organizationId: uuid().references(() => organizations.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    // Инкрементируется при logout-all, обесценивает все активные access-токены (§5.5)
    tokenVersion: integer().notNull().default(0),
    lastLoginAt: timestamp({ withTimezone: true, mode: 'date' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_phone_key').on(t.phone),
    index('users_org_role_idx').on(t.organizationId, t.role),
    check('users_phone_format_chk', sql`${t.phone} ~ '^\\+7[0-9]{10}$'`),
    // Инвариант: у superadmin organization_id = NULL; у остальных ролей — NOT NULL
    check(
      'users_org_role_consistency_chk',
      sql`(${t.role} = 'superadmin' AND ${t.organizationId} IS NULL)
          OR (${t.role} <> 'superadmin' AND ${t.organizationId} IS NOT NULL)`,
    ),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
