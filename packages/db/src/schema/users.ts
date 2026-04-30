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
import { userRoleEnum, userStatusEnum } from './enums'
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
    // 'active' | 'blocked'. Default 'active'. Orthogonal к deleted_at.
    status: userStatusEnum().notNull().default('active'),
    // Soft-delete. NULL = живой пользователь; timestamptz = когда удалён (история сохраняется).
    deletedAt: timestamp({ withTimezone: true, mode: 'date' }),
    // Инкрементируется при logout-all, обесценивает все активные access-токены (§5.5)
    tokenVersion: integer().notNull().default(0),
    lastLoginAt: timestamp({ withTimezone: true, mode: 'date' }),
    // 'light' | 'dark' | 'system' (B3-THEME). Default 'system' — следовать
    // OS prefers-color-scheme. Anonymous users persist в localStorage; logged-in —
    // здесь, чтобы preference переживала смену устройства.
    themeMode: text().notNull().default('system'),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_phone_key').on(t.phone),
    index('users_org_role_idx').on(t.organizationId, t.role),
    // Partial index для типичных list-запросов в пределах организации.
    // Hot path: RBAC-scoped выборки owner'ом активных пользователей своей org.
    index('users_active_idx')
      .on(t.organizationId)
      .where(sql`status = 'active' AND deleted_at IS NULL`),
    check('users_phone_format_chk', sql`${t.phone} ~ '^\\+7[0-9]{10}$'`),
    check('users_theme_mode_chk', sql`${t.themeMode} IN ('light', 'dark', 'system')`),
    // Инвариант (ADR 0003): superadmin — org IS NULL; owner — org IS NOT NULL;
    // operator — org IS NULL (идентичность живёт на crane_profiles;
    // per-org context резолвится через organization_operators + X-Organization-Id
    // header, не на уровне users).
    check(
      'users_org_role_consistency_chk',
      sql`(${t.role} = 'superadmin' AND ${t.organizationId} IS NULL)
          OR (${t.role} = 'owner' AND ${t.organizationId} IS NOT NULL)
          OR (${t.role} = 'operator')`,
    ),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
