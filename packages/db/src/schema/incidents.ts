import { sql } from 'drizzle-orm'
import { check, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { cranes } from './cranes'
import { organizations } from './organizations'
import { shifts } from './shifts'
import { sites } from './sites'
import { users } from './users'

/**
 * incidents (M6, ADR 0008) — operator-reported проблемы во время или после
 * shift'а: crane malfunction, material fall, near-miss, minor injury,
 * safety violation, other.
 *
 * Schema decisions:
 *   - reporter_user_id RESTRICT — incident always tied к valid user'у.
 *   - reporter_name + reporter_phone DENORMALIZED — для query performance
 *     (owner queue без JOIN'а на users) + record durability if user later
 *     deleted (history preserved).
 *   - shift_id / site_id / crane_id NULLABLE с ON DELETE SET NULL — incident
 *     remains valid даже если shift/site/crane удалены.
 *   - latitude/longitude NULLABLE — auto-attached на mobile из M5 GPS queue
 *     (если recent ping есть), но offline-tolerant.
 *   - description CHECK >=10 chars — приhardware lvl против пустых reports.
 *   - resolution_notes nullable — заполняется только при resolve.
 *
 * Status workflow:
 *   submitted → acknowledged → resolved
 *   submitted → escalated → (superadmin can resolve OR de-escalate back)
 *   escalated → resolved (superadmin closes)
 *
 * Type/severity/status — text + CHECK constraint вместо pgEnum: enums require
 * ALTER TYPE для каждого нового value (миграция-болевая для small changes).
 * Legal types в РК могут расширяться — text + CHECK более гибкий.
 */
export const incidents = pgTable(
  'incidents',
  {
    id: uuid().primaryKey().defaultRandom(),
    reporterUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reporterName: text().notNull(),
    reporterPhone: text().notNull(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    shiftId: uuid().references(() => shifts.id, { onDelete: 'set null' }),
    siteId: uuid().references(() => sites.id, { onDelete: 'set null' }),
    craneId: uuid().references(() => cranes.id, { onDelete: 'set null' }),
    type: text().notNull(),
    severity: text().notNull(),
    status: text().notNull().default('submitted'),
    description: text().notNull(),
    reportedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    acknowledgedAt: timestamp({ withTimezone: true, mode: 'date' }),
    acknowledgedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp({ withTimezone: true, mode: 'date' }),
    resolvedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    resolutionNotes: text(),
    latitude: numeric({ precision: 10, scale: 7 }),
    longitude: numeric({ precision: 10, scale: 7 }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // Owner queue per-org filtered by status; sorted by reported time.
    index('incidents_org_status_time_idx').on(t.organizationId, t.status, sql`reported_at DESC`),
    // Critical-severity surface для dashboard badge.
    index('incidents_severity_idx')
      .on(t.severity)
      .where(sql`status IN ('submitted', 'acknowledged', 'escalated')`),
    // Operator's own incidents history.
    index('incidents_reporter_time_idx').on(t.reporterUserId, sql`reported_at DESC`),
    index('incidents_shift_idx').on(t.shiftId).where(sql`shift_id IS NOT NULL`),
    check(
      'incidents_type_chk',
      sql`${t.type} IN ('crane_malfunction', 'material_fall', 'near_miss', 'minor_injury', 'safety_violation', 'other')`,
    ),
    check('incidents_severity_chk', sql`${t.severity} IN ('info', 'warning', 'critical')`),
    check(
      'incidents_status_chk',
      sql`${t.status} IN ('submitted', 'acknowledged', 'resolved', 'escalated')`,
    ),
    check(
      'incidents_lat_range_chk',
      sql`${t.latitude} IS NULL OR ${t.latitude} BETWEEN -90 AND 90`,
    ),
    check(
      'incidents_lng_range_chk',
      sql`${t.longitude} IS NULL OR ${t.longitude} BETWEEN -180 AND 180`,
    ),
    check('incidents_description_min_chk', sql`char_length(${t.description}) >= 10`),
  ],
)

export const INCIDENT_TYPES = [
  'crane_malfunction',
  'material_fall',
  'near_miss',
  'minor_injury',
  'safety_violation',
  'other',
] as const
export type IncidentType = (typeof INCIDENT_TYPES)[number]

export const INCIDENT_SEVERITIES = ['info', 'warning', 'critical'] as const
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number]

export const INCIDENT_STATUSES = ['submitted', 'acknowledged', 'resolved', 'escalated'] as const
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]

export type Incident = {
  id: string
  reporterUserId: string
  reporterName: string
  reporterPhone: string
  organizationId: string
  shiftId: string | null
  siteId: string | null
  craneId: string | null
  type: IncidentType
  severity: IncidentSeverity
  status: IncidentStatus
  description: string
  reportedAt: Date
  acknowledgedAt: Date | null
  acknowledgedByUserId: string | null
  resolvedAt: Date | null
  resolvedByUserId: string | null
  resolutionNotes: string | null
  latitude: number | null
  longitude: number | null
  createdAt: Date
  updatedAt: Date
}

export type NewIncident = typeof incidents.$inferInsert
