import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { craneProfiles } from './crane-profiles'
import {
  operatorAvailabilityEnum,
  operatorStatusEnum,
  organizationOperatorApprovalStatusEnum,
} from './enums'
import { organizations } from './organizations'
import { users } from './users'

/**
 * organization_operators — M:N membership между crane_profile и organization
 * (ADR 0003). «Факт работы профиля X в дочке Y».
 *
 * Один crane_profile → 0..N organization_operators (один человек в нескольких
 * дочках). Одна organization → 0..N organization_operators (дочка нанимает
 * разных крановщиков). UNIQUE(crane_profile_id, organization_id) среди живых
 * — повторный найм того же человека в ту же дочку после soft-delete
 * возможен.
 *
 * `approval_status` — per-hire gate (ADR 0003 pipeline 2). Холдинг одобряет
 * каждый найм. Даже если crane_profile approved глобально, конкретная hire
 * может быть rejected. ADR 0002 §4.2b паттерн: approve/reject superadmin-only,
 * rejected — read-only (delete для cleanup), operational mutations требуют
 * approved.
 *
 * `status` + `availability` — operational (employment + shifts), те же что
 * были в операторной таблице B2b. `status='active'` + `availability IS NOT NULL`
 * допустимо; остальное — availability NULL. CHECK constraint страхует.
 *
 * `terminated_at` — исторический факт, сохраняется при восстановлении
 * (terminated→active). Rehire с явной rehired_at — в B2b backlog, остаётся
 * актуальным.
 *
 * ### B2d-1 preservation
 *
 * `id` backfilled 1→1 из `operators.id` (preserved), чтобы audit_log.targetId
 * ссылающийся на старые operator id'шники продолжал работать. Это ключевой
 * invariant migration 0007.
 */
export const organizationOperators = pgTable(
  'organization_operators',
  {
    id: uuid().primaryKey().defaultRandom(),
    craneProfileId: uuid()
      .notNull()
      .references(() => craneProfiles.id, { onDelete: 'restrict' }),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    hiredAt: date({ mode: 'date' }),
    terminatedAt: date({ mode: 'date' }),
    status: operatorStatusEnum().notNull().default('active'),
    availability: operatorAvailabilityEnum(),
    approvalStatus: organizationOperatorApprovalStatusEnum().notNull().default('pending'),
    approvedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp({ withTimezone: true, mode: 'date' }),
    rejectedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    rejectedAt: timestamp({ withTimezone: true, mode: 'date' }),
    rejectionReason: text(),
    deletedAt: timestamp({ withTimezone: true, mode: 'date' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // Один профиль в одной дочке может быть активен (non-soft-deleted) только
    // один раз. Повторный найм после soft-delete освобождает слот.
    uniqueIndex('organization_operators_profile_org_unique_active_idx')
      .on(t.craneProfileId, t.organizationId)
      .where(sql`deleted_at IS NULL`),
    // Hot path: owner листает approved-найм'ы своей org, не terminated.
    index('organization_operators_org_approved_idx')
      .on(t.organizationId)
      .where(sql`deleted_at IS NULL AND approval_status = 'approved' AND status <> 'terminated'`),
    // Hot path для холдинга: pending-hire очередь глобально.
    index('organization_operators_pending_approval_idx')
      .on(t.createdAt)
      .where(sql`approval_status = 'pending' AND deleted_at IS NULL`),
    // Reverse lookup: какие дочки наняли этот профиль.
    index('organization_operators_profile_idx')
      .on(t.craneProfileId)
      .where(sql`deleted_at IS NULL`),
    // Инвариант из B2b: availability имеет смысл только для active operator'а.
    check(
      'organization_operators_availability_only_when_active_chk',
      sql`${t.availability} IS NULL OR ${t.status} = 'active'`,
    ),
  ],
)

export const ORGANIZATION_OPERATOR_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const
export type OrganizationOperatorApprovalStatus =
  (typeof ORGANIZATION_OPERATOR_APPROVAL_STATUSES)[number]

export const OPERATOR_STATUSES = ['active', 'blocked', 'terminated'] as const
export type OperatorStatus = (typeof OPERATOR_STATUSES)[number]

export const OPERATOR_AVAILABILITY = ['free', 'busy', 'on_shift'] as const
export type OperatorAvailability = (typeof OPERATOR_AVAILABILITY)[number]

export type OrganizationOperator = {
  id: string
  craneProfileId: string
  organizationId: string
  hiredAt: Date | null
  terminatedAt: Date | null
  status: OperatorStatus
  availability: OperatorAvailability | null
  approvalStatus: OrganizationOperatorApprovalStatus
  approvedByUserId: string | null
  approvedAt: Date | null
  rejectedByUserId: string | null
  rejectedAt: Date | null
  rejectionReason: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type NewOrganizationOperator = typeof organizationOperators.$inferInsert
