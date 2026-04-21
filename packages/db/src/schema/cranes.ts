import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { craneStatusEnum, craneTypeEnum } from './enums'
import { organizations } from './organizations'
import { sites } from './sites'

/**
 * Cranes table. Моделирует единицу грузоподъёмной техники (CLAUDE.md §6.3).
 *
 * `site_id` — current home site, one-to-one, ON DELETE SET NULL. Не путать
 * с будущей таблицей `assignments` (operator × crane × period).
 * `tariffs_json` — placeholder до появления payroll-спеки (Этап 3, см. backlog).
 * `deleted_at` — soft-delete, ортогонально `status`.
 */
export const cranes = pgTable(
  'cranes',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    siteId: uuid().references(() => sites.id, { onDelete: 'set null' }),
    type: craneTypeEnum().notNull(),
    model: text().notNull(),
    inventoryNumber: text(),
    // numeric возвращается postgres-js как string — convert в hydrate.
    capacityTon: numeric({ precision: 8, scale: 2 }).notNull(),
    boomLengthM: numeric({ precision: 6, scale: 2 }),
    yearManufactured: integer(),
    tariffsJson: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: craneStatusEnum().notNull().default('active'),
    notes: text(),
    deletedAt: timestamp({ withTimezone: true, mode: 'date' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // Partial UNIQUE: один и тот же inventory_number может встретиться несколько
    // раз только если предыдущие soft-deleted. NULL inventory_number
    // исключён из индекса (не обязателен для арендованных кранов).
    uniqueIndex('cranes_inventory_unique_active_idx')
      .on(t.organizationId, t.inventoryNumber)
      .where(sql`deleted_at IS NULL AND inventory_number IS NOT NULL`),
    // Hot path: owner листает живые, не списанные краны своей org.
    index('cranes_organization_idx')
      .on(t.organizationId)
      .where(sql`deleted_at IS NULL AND status <> 'retired'`),
    // Lookup «какие краны стоят на этом site'е» — активные, без soft-deleted.
    index('cranes_site_idx')
      .on(t.siteId)
      .where(sql`site_id IS NOT NULL AND status = 'active' AND deleted_at IS NULL`),
    check('cranes_capacity_positive_chk', sql`${t.capacityTon} > 0`),
    check('cranes_boom_length_positive_chk', sql`${t.boomLengthM} IS NULL OR ${t.boomLengthM} > 0`),
    check(
      'cranes_year_manufactured_range_chk',
      sql`${t.yearManufactured} IS NULL OR (${t.yearManufactured} >= 1900 AND ${t.yearManufactured} <= EXTRACT(YEAR FROM now())::integer)`,
    ),
  ],
)

export const CRANE_TYPES = ['tower', 'mobile', 'crawler', 'overhead'] as const
export type CraneType = (typeof CRANE_TYPES)[number]

export const CRANE_STATUSES = ['active', 'maintenance', 'retired'] as const
export type CraneStatus = (typeof CRANE_STATUSES)[number]

/**
 * Hydrated row-тип. Drizzle `$inferSelect` вернул бы `capacityTon: string`
 * из-за numeric-маппинга postgres-js; репозиторий конвертит в number и
 * отдаёт наверх уже числами. Source of truth для service + handler + DTO.
 */
export type Crane = {
  id: string
  organizationId: string
  siteId: string | null
  type: CraneType
  model: string
  inventoryNumber: string | null
  capacityTon: number
  boomLengthM: number | null
  yearManufactured: number | null
  tariffsJson: Record<string, unknown>
  status: CraneStatus
  notes: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type NewCrane = typeof cranes.$inferInsert
