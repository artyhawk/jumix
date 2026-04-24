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
import { craneProfiles } from './crane-profiles'
import { cranes } from './cranes'
import { shiftStatusEnum } from './enums'
import { organizations } from './organizations'
import { sites } from './sites'
import { users } from './users'

/**
 * Shifts table — лайфцикл рабочей смены крановщика (ADR 0006, M4).
 *
 * State machine:
 *   active ⇄ paused  — advisory pause (time accounting marker, не hard-lock)
 *   active → ended   — завершение
 *   paused → ended   — завершение во время перерыва (auto-resume в accounting)
 *
 * Денормализация: `organization_id` и `site_id` берутся из `crane` при
 * создании shift'а. Это снимает необходимость JOIN'а с cranes в hot-path
 * запросах owner-dashboard и site-drawer. Consistency `shift.organization_id
 * === crane.organization_id` гарантируется service layer (single writer).
 *
 * `total_pause_seconds` — накопленная длительность pauses. При resume
 * service вычисляет `now - paused_at`, добавляет к total, сбрасывает
 * `paused_at`. При end во время pause — тот же расчёт перед переходом
 * в terminal state.
 *
 * `notes` — optional operator comment на end. MVP: UI собирает не всегда
 * (поле surface'ится в detail screen + формальные incident reports идут
 * через отдельный модуль в M6).
 */
export const shifts = pgTable(
  'shifts',
  {
    id: uuid().primaryKey().defaultRandom(),
    craneId: uuid()
      .notNull()
      .references(() => cranes.id, { onDelete: 'restrict' }),
    operatorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    craneProfileId: uuid()
      .notNull()
      .references(() => craneProfiles.id, { onDelete: 'restrict' }),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: 'restrict' }),
    status: shiftStatusEnum().notNull().default('active'),
    startedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    endedAt: timestamp({ withTimezone: true, mode: 'date' }),
    pausedAt: timestamp({ withTimezone: true, mode: 'date' }),
    totalPauseSeconds: integer().notNull().default(0),
    notes: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // Один operator может иметь ровно одну «живую» (active|paused) смену.
    // DB-level защита против race при spam-клике «Начать смену» и багов в
    // service-guard'е. `ended` смены не участвуют — их может быть много.
    uniqueIndex('shifts_active_per_operator_idx')
      .on(t.operatorId)
      .where(sql`status IN ('active', 'paused')`),
    // История смен оператора, DESC by started_at.
    index('shifts_operator_started_at_idx').on(t.operatorId, sql`started_at DESC`),
    // Crane → его текущая смена (active/paused).
    index('shifts_crane_active_idx')
      .on(t.craneId)
      .where(sql`status IN ('active', 'paused')`),
    // Owner dashboard: «кранов в работе» per-org.
    index('shifts_organization_active_idx')
      .on(t.organizationId)
      .where(sql`status IN ('active', 'paused')`),
    // Site drawer: «текущие смены» per-site.
    index('shifts_site_active_idx')
      .on(t.siteId)
      .where(sql`status IN ('active', 'paused')`),
    // State-machine invariants страхуем на DB level.
    check(
      'shifts_paused_at_consistency_chk',
      sql`(${t.status} = 'paused' AND ${t.pausedAt} IS NOT NULL) OR (${t.status} <> 'paused' AND ${t.pausedAt} IS NULL)`,
    ),
    check(
      'shifts_ended_at_consistency_chk',
      sql`(${t.status} = 'ended' AND ${t.endedAt} IS NOT NULL) OR (${t.status} <> 'ended' AND ${t.endedAt} IS NULL)`,
    ),
    check('shifts_total_pause_nonneg_chk', sql`${t.totalPauseSeconds} >= 0`),
  ],
)

export const SHIFT_STATUSES = ['active', 'paused', 'ended'] as const
export type ShiftStatus = (typeof SHIFT_STATUSES)[number]

export type Shift = {
  id: string
  craneId: string
  operatorId: string
  craneProfileId: string
  organizationId: string
  siteId: string
  status: ShiftStatus
  startedAt: Date
  endedAt: Date | null
  pausedAt: Date | null
  totalPauseSeconds: number
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewShift = typeof shifts.$inferInsert
