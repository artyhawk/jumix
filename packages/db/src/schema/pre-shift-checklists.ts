import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { shifts } from './shifts'

/**
 * pre_shift_checklists (M6, ADR 0008) — обязательная проверка СИЗ перед
 * каждой сменой. Per-shift (не per-day): equipment может быть damaged между
 * сменами, законом РК трактуется как check before EACH shift.
 *
 * Submission embedded в `POST /shifts/start` atomic transaction —
 * checklist row создаётся вместе со shift'ом, иначе оба rollback.
 * UNIQUE(shift_id) гарантирует на DB level что одна shift имеет одну
 * checklist.
 *
 * `items` jsonb схема:
 *   {
 *     helmet: { checked: boolean, photoKey: string | null, notes: string | null },
 *     vest:   { ... },
 *     ...
 *   }
 *
 * Validated на service-слое (`@jumix/shared/api/checklist`) против
 * `REQUIRED_ITEMS_BY_CRANE_TYPE` — harness required только для tower cranes.
 *
 * ON DELETE CASCADE: shifts не soft-delete'ятся в MVP, так что cascade
 * фактически не trigger'ится; но если когда-то delete вернётся — checklist
 * живёт строго со shift'ом.
 */
export const preShiftChecklists = pgTable(
  'pre_shift_checklists',
  {
    id: uuid().primaryKey().defaultRandom(),
    shiftId: uuid()
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),
    submittedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    items: jsonb().$type<Record<string, ChecklistItemRow>>().notNull(),
    generalNotes: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pre_shift_checklists_shift_id_unique').on(t.shiftId)],
)

export type ChecklistItemRow = {
  checked: boolean
  photoKey: string | null
  notes: string | null
}

export type PreShiftChecklist = {
  id: string
  shiftId: string
  submittedAt: Date
  items: Record<string, ChecklistItemRow>
  generalNotes: string | null
  createdAt: Date
}

export type NewPreShiftChecklist = typeof preShiftChecklists.$inferInsert
