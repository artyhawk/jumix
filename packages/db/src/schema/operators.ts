import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { operatorAvailabilityEnum, operatorStatusEnum } from './enums'
import { organizations } from './organizations'
import { users } from './users'

/**
 * Operators table. Профиль крановщика в составе организации.
 *
 * Связь с users 1:1 в рамках organization (partial UNIQUE на
 * (user_id, organization_id) для живых записей). Один user — один operator
 * внутри org; multi-org перенесли в backlog (см. Operator transfer).
 *
 * `iin` — Индивидуальный Идентификационный Номер РК (12 цифр + контрольный
 * разряд). Уникальность по (organization_id, iin) среди не-soft-deleted —
 * partial unique index. Checksum-валидация в Zod (iinSchema), format-check
 * дублируется на уровне БД для страховки от bypass Zod.
 *
 * `terminated_at` — **исторический факт**, НЕ очищается при восстановлении
 * operator'а (status: terminated → active). Юридически в РК трудовые события
 * документируются, перезаписывать прошлое увольнение нельзя. Интерпретация
 * для UI: "operator был terminated [terminated_at]; текущий status [status]".
 * status='active' + terminated_at!=null → «восстановлен после увольнения».
 * Rehire-flow с явным `rehired_at` — в backlog.
 *
 * `availability` — имеет смысл только при status='active'; CHECK constraint
 * это гарантирует. Для blocked/terminated всегда NULL. Endpoint'ы смен
 * (B3/shifts) будут изменять это поле.
 */
export const operators = pgTable(
  'operators',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    firstName: text().notNull(),
    lastName: text().notNull(),
    patronymic: text(),
    iin: text().notNull(),
    avatarKey: text(),
    hiredAt: date({ mode: 'date' }),
    terminatedAt: date({ mode: 'date' }),
    specialization: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: operatorStatusEnum().notNull().default('active'),
    availability: operatorAvailabilityEnum(),
    deletedAt: timestamp({ withTimezone: true, mode: 'date' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // Partial UNIQUE: ИИН уникален в пределах org среди живых. Soft-deleted
    // освобождает слот (повторный наём того же человека, если прошлый терминейт
    // был ошибочно удалён — MVP ограничение, multi-org в backlog).
    uniqueIndex('operators_iin_unique_active_idx')
      .on(t.organizationId, t.iin)
      .where(sql`deleted_at IS NULL`),
    // Один user в одной org может быть operator'ом только один раз (живой).
    uniqueIndex('operators_user_org_unique_active_idx')
      .on(t.userId, t.organizationId)
      .where(sql`deleted_at IS NULL`),
    // Hot path: owner листает живых, не-уволенных operators своей org.
    index('operators_organization_idx')
      .on(t.organizationId)
      .where(sql`deleted_at IS NULL AND status <> 'terminated'`),
    // Self-scope lookup: operator по user_id (для /me endpoints).
    index('operators_user_idx').on(t.userId),
    // Format check на уровне БД — страховка если Zod обошли.
    check('operators_iin_format_chk', sql`${t.iin} ~ '^[0-9]{12}$'`),
    // Инвариант: availability имеет смысл только для active operator'а.
    check(
      'operators_availability_only_when_active_chk',
      sql`${t.availability} IS NULL OR ${t.status} = 'active'`,
    ),
  ],
)

export const OPERATOR_STATUSES = ['active', 'blocked', 'terminated'] as const
export type OperatorStatus = (typeof OPERATOR_STATUSES)[number]

export const OPERATOR_AVAILABILITY = ['free', 'busy', 'on_shift'] as const
export type OperatorAvailability = (typeof OPERATOR_AVAILABILITY)[number]

/**
 * Hydrated тип. Drizzle `$inferSelect` достаточно для operators (нет numeric
 * полей), но явный тип служит single-source-of-truth для service/handler/DTO —
 * тот же паттерн, что у Crane.
 */
export type Operator = {
  id: string
  userId: string
  organizationId: string
  firstName: string
  lastName: string
  patronymic: string | null
  iin: string
  avatarKey: string | null
  hiredAt: Date | null
  terminatedAt: Date | null
  specialization: Record<string, unknown>
  status: OperatorStatus
  availability: OperatorAvailability | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type NewOperator = typeof operators.$inferInsert
