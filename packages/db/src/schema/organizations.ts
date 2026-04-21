import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { organizationStatusEnum } from './enums'

export const organizations = pgTable(
  'organizations',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    // БИН — 12 цифр, уникален в РК
    bin: text().notNull(),
    status: organizationStatusEnum().notNull().default('active'),
    contactName: text(),
    contactPhone: text(),
    contactEmail: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('organizations_bin_key').on(t.bin),
    index('organizations_status_idx').on(t.status),
    check('organizations_bin_format_chk', sql`${t.bin} ~ '^[0-9]{12}$'`),
  ],
)

export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert
