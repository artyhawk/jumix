import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { craneProfileApprovalStatusEnum } from './enums'
import { users } from './users'

/**
 * crane_profiles — глобальная идентичность крановщика на платформе (ADR 0003).
 *
 * Это «карточка человека»: ФИО, ИИН, аватар, навыки. ПДН живут здесь, а не
 * в организационной записи: один и тот же человек может работать в N дочках
 * (через organization_operators — M:N membership), но профиль у него один.
 *
 * ИИН — глобальный UNIQUE среди живых. Если запись soft-deleted — слот
 * освобождается (исключительный сценарий, требует superadmin intervention).
 *
 * `user_id` — 1:1 с users; partial UNIQUE active гарантирует что один user
 * имеет максимум один живой профиль. При soft-delete профиля user остаётся —
 * может потом быть привязан к новому crane_profile (restore flow).
 *
 * `approval_status` — platform-gate (ADR 0003 pipeline 1). Только approved
 * профили могут появляться в пуле найма (organization_operators create
 * требует profile.approval_status='approved' — enforcement в service layer,
 * B2d-3).
 *
 * `specialization` — навыки человека, не привязанные к компании (сертификаты,
 * допуски). До формализации в B2d-4 — свободный jsonb default {}.
 *
 * ### Compat shim (B2d-1) noteworthy
 *
 * `OperatorRepository` в B2d-1 читает профиль JOIN'ом с organization_operators
 * и отдаёт единый hydrated `Operator`. В B2d-2 модуль разделится на
 * crane-profile + organization-operator, и этот JOIN уйдёт из repo.
 */
export const craneProfiles = pgTable(
  'crane_profiles',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    firstName: text().notNull(),
    lastName: text().notNull(),
    patronymic: text(),
    iin: text().notNull(),
    avatarKey: text(),
    specialization: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    approvalStatus: craneProfileApprovalStatusEnum().notNull().default('pending'),
    approvedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp({ withTimezone: true, mode: 'date' }),
    rejectedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    rejectedAt: timestamp({ withTimezone: true, mode: 'date' }),
    rejectionReason: text(),
    // ---------- license (ADR 0005) ----------
    // license_status НЕ хранится: computed на boundary из (licenseExpiresAt, NOW()) —
    // меняется со временем без action'а, хранение в БД потребовало бы daily UPDATE.
    licenseKey: text(),
    licenseExpiresAt: date({ mode: 'date' }),
    licenseVersion: integer().notNull().default(0),
    // drizzle's snake_case converter не вставляет underscore между буквой и
    // цифрой (`Warning30d` → `warning30d`). Миграция 0009 завела колонки с
    // явными разделителями (`license_warning_30d_sent_at`) — фиксируем имена
    // через .name() чтобы schema и БД не расходились.
    licenseWarning30dSentAt: timestamp('license_warning_30d_sent_at', {
      withTimezone: true,
      mode: 'date',
    }),
    licenseWarning7dSentAt: timestamp('license_warning_7d_sent_at', {
      withTimezone: true,
      mode: 'date',
    }),
    licenseExpiredAt: timestamp({ withTimezone: true, mode: 'date' }),
    deletedAt: timestamp({ withTimezone: true, mode: 'date' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // Глобальная уникальность ИИН среди живых профилей. Один человек — один
    // профиль на платформе. ADR 0003 §Backfill описывает collision-handling.
    uniqueIndex('crane_profiles_iin_unique_active_idx')
      .on(t.iin)
      .where(sql`deleted_at IS NULL`),
    // 1:1 user → crane_profile среди живых. Re-create после soft-delete возможен.
    uniqueIndex('crane_profiles_user_unique_active_idx')
      .on(t.userId)
      .where(sql`deleted_at IS NULL`),
    // Hot path для суперадмина: очередь pending-профилей для approval queue UX.
    index('crane_profiles_pending_approval_idx')
      .on(t.createdAt)
      .where(sql`approval_status = 'pending' AND deleted_at IS NULL`),
    // Быстрый self-scope lookup по user_id (/me endpoints).
    index('crane_profiles_user_idx').on(t.userId),
    // Hot path для license-expiry cron — только профили с указанным expires_at,
    // которые могут когда-либо попасть в warning-scan (ADR 0005).
    index('crane_profiles_license_expiry_scan_idx')
      .on(t.licenseExpiresAt)
      .where(sql`license_expires_at IS NOT NULL AND deleted_at IS NULL`),
    // Format check уровня БД — страховка если Zod обошли.
    check('crane_profiles_iin_format_chk', sql`${t.iin} ~ '^[0-9]{12}$'`),
    // License consistency: либо всё NULL (не загружено), либо всё заполнено
    // (загружено). Частичные состояния невозможны (ADR 0005).
    check(
      'crane_profiles_license_consistency_chk',
      sql`(${t.licenseKey} IS NULL AND ${t.licenseExpiresAt} IS NULL)
          OR (${t.licenseKey} IS NOT NULL AND ${t.licenseExpiresAt} IS NOT NULL)`,
    ),
  ],
)

export const CRANE_PROFILE_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const
export type CraneProfileApprovalStatus = (typeof CRANE_PROFILE_APPROVAL_STATUSES)[number]

export type CraneProfile = {
  id: string
  userId: string
  firstName: string
  lastName: string
  patronymic: string | null
  iin: string
  avatarKey: string | null
  specialization: Record<string, unknown>
  approvalStatus: CraneProfileApprovalStatus
  approvedByUserId: string | null
  approvedAt: Date | null
  rejectedByUserId: string | null
  rejectedAt: Date | null
  rejectionReason: string | null
  licenseKey: string | null
  licenseExpiresAt: Date | null
  licenseVersion: number
  licenseWarning30dSentAt: Date | null
  licenseWarning7dSentAt: Date | null
  licenseExpiredAt: Date | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type NewCraneProfile = typeof craneProfiles.$inferInsert
