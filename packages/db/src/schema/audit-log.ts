import { customType, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'
import { users } from './users'

const inet = customType<{ data: string }>({ dataType: () => 'inet' })

/**
 * Audit log — append-only журнал чувствительных действий.
 * Actor может быть null (system event), organization_id может быть null (platform-level).
 * Поле action — свободная строка вида 'organization.create', 'operator.approve',
 * 'payroll.adjust' (см. CLAUDE.md §7.5) — enum не используем, чтобы не плодить миграции.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    // Роль сохраняется копией на момент события (даже если user потом удалён)
    actorRole: text(),
    action: text().notNull(),
    targetType: text(),
    targetId: uuid(),
    organizationId: uuid().references(() => organizations.id, { onDelete: 'set null' }),
    metadata: jsonb().notNull().default({}),
    ipAddress: inet(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // Основной индекс для фильтрации по тенанту и сортировки по времени (§6.7)
    index('audit_log_org_time_idx').on(t.organizationId, t.createdAt),
    index('audit_log_actor_time_idx').on(t.actorUserId, t.createdAt),
    index('audit_log_target_idx').on(t.targetType, t.targetId),
    index('audit_log_action_time_idx').on(t.action, t.createdAt),
  ],
)

export type AuditEntry = typeof auditLog.$inferSelect
export type NewAuditEntry = typeof auditLog.$inferInsert
