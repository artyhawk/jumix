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

// Жизненный цикл объекта (стройплощадки)
//   active    → активная стройка, смены фиксируются
//   completed → стройка сдана, данные остаются, новые смены не создаются
//   archived  → скрыт из списков, переходит из любого состояния
export const siteStatusEnum = pgEnum('site_status', ['active', 'completed', 'archived'])

// Тип крана. Соответствует разновидностям на стройках РК; расширяется при
// необходимости отдельной миграцией (ALTER TYPE ... ADD VALUE).
export const craneTypeEnum = pgEnum('crane_type', ['tower', 'mobile', 'crawler', 'overhead'])

// Жизненный цикл крана.
//   active      → в эксплуатации, может быть назначен на смены
//   maintenance → на ТО/ремонте (временно), новые смены не создаются
//   retired     → списан с эксплуатации (терминал), назад не возвращается
// Orthogonal к deleted_at: retired + deleted_at=null → виден как «списан»,
// deleted_at!=null → скрыт из UI полностью, история сохраняется.
export const craneStatusEnum = pgEnum('crane_status', ['active', 'maintenance', 'retired'])

// События auth для audit trail (CLAUDE.md §5.4)
export const authEventTypeEnum = pgEnum('auth_event_type', [
  'login_success',
  'login_failure',
  'logout',
  'logout_all',
  'refresh_used',
  'refresh_reuse_detected',
  'refresh_rotation_race',
  'password_reset_requested',
  'password_reset_completed',
  'sms_requested',
  'sms_verified',
  'sms_verify_failed',
  'account_locked',
  'account_unlocked',
])
