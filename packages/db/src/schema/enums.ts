import { pgEnum } from 'drizzle-orm/pg-core'

// Роли пользователей платформы (CLAUDE.md §1.4)
export const userRoleEnum = pgEnum('user_role', ['superadmin', 'owner', 'operator'])

// Статус живого пользователя. Permanent-удаление выражается через
// `users.deleted_at IS NOT NULL` (soft-delete) — ортогонально status.
// Комбинации:
//   active  + deleted_at=null   → обычный рабочий пользователь
//   blocked + deleted_at=null   → временная блокировка (можно восстановить)
//   blocked + deleted_at!=null  → удалён, история сохранена
export const userStatusEnum = pgEnum('user_status', ['active', 'blocked'])

// Жизненный цикл организации
export const organizationStatusEnum = pgEnum('organization_status', [
  'active',
  'suspended',
  'archived',
])

// События auth для audit trail (CLAUDE.md §5.4)
export const authEventTypeEnum = pgEnum('auth_event_type', [
  'login_success',
  'login_failure',
  'logout',
  'logout_all',
  'refresh_used',
  'refresh_reuse_detected',
  'password_reset_requested',
  'password_reset_completed',
  'sms_requested',
  'sms_verified',
  'sms_verify_failed',
  'account_locked',
  'account_unlocked',
])
