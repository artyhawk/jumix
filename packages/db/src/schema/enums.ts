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

// Approval workflow крана (ADR 0002 — holding-approval model). Ортогонально
// operational `status`. Admin-gated — меняется только через /approve и /reject
// endpoints суперадмина.
//   pending   → owner запросил добавление, холдинг ещё не решил; кран в
//               operational-обороте НЕ участвует (change_status → 409)
//   approved  → холдинг одобрил; operational работа открыта (lifecycle через
//               status active/maintenance/retired)
//   rejected  → холдинг отказал; запись read-only (update/setStatus → 409),
//               разрешено только soft-delete для cleanup
export const craneApprovalStatusEnum = pgEnum('crane_approval_status', [
  'pending',
  'approved',
  'rejected',
])

// Жизненный цикл крановщика (employment status).
//   active      → работает нормально, смены фиксируются
//   blocked     → временно заблокирован (дисциплинарно), не может работать,
//                 профиль остаётся виден самому оператору
//   terminated  → трудовой договор расторгнут, не может работать; профиль
//                 остаётся виден оператору — по законодательству РК (PDL)
//                 субъект персональных данных имеет право читать свои данные,
//                 в т.ч. после увольнения
// Orthogonal к deleted_at: terminated + deleted_at=null → в списке как «уволен»;
// deleted_at!=null → скрыт из UI полностью (permanent-удаление).
export const operatorStatusEnum = pgEnum('operator_status', ['active', 'blocked', 'terminated'])

// Доступность крановщика для назначения смен. Имеет смысл ТОЛЬКО при
// status='active' (CHECK constraint на уровне БД). Nullable: у blocked/terminated
// availability всегда NULL. Сейчас placeholder — endpoints смен появятся в
// B3/shifts, там же логика перехода free ↔ busy ↔ on_shift.
export const operatorAvailabilityEnum = pgEnum('operator_availability', [
  'free',
  'busy',
  'on_shift',
])

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
