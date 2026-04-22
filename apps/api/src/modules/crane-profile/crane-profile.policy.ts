import type { AuthContext } from '@jumix/auth'
import type { CraneProfile } from '@jumix/db'

/**
 * Чистые функции политики для crane-profiles-модуля (ADR 0003 + authorization.md
 * §4.2a/§4.2b/§4.2c). БД не трогают — только ctx + target.
 *
 * Сущность — «платформенная личность» крановщика, ортогональная организациям.
 * ИИН глобально уникален. Approval-pipeline 1 из ADR 0003 — superadmin решает,
 * пускать ли человека в пул найма.
 *
 * Иерархия:
 *   superadmin — видит/правит любой профиль; approve/reject pipeline 1.
 *   owner      — ОГРАНИЧЕННЫЙ доступ: в B2d-2a owner НЕ ходит напрямую в
 *                crane-profile endpoints. Admin-create проходит через operator
 *                (создаёт user+profile+hire в одном tx). Owner видит своих
 *                крановщиков через organization-operators endpoints (с JOIN'ом
 *                имени из crane_profiles).
 *   operator   — self-scope: читает/обновляет только СВОЙ профиль
 *                (`ctx.userId === profile.userId`), subject exclusively из ctx.
 *
 * Self-scope convention (CLAUDE.md §6 rule #10, authorization.md §4.2a):
 *   canReadSelf   — любой approval_status, любой статус найма. Причина: ПДЛ РК
 *                   + blocked оператор обязан понимать причину блокировки.
 *   canUpdateSelf — subject из ctx, approval_status/хиры не проверяем
 *                   (идентичность не «замораживается» из-за rejected pipeline1
 *                   — платформа сама решает, что делать с отказниками;
 *                   freeze полностью = deleted_at).
 *
 * Approval workflow (§4.2b):
 *   canApprove/canReject — строго superadmin. Самоапрув запрещён.
 *   canUpdate rejected crane_profile'а → false (read-only после отказа;
 *   единственный путь — delete).
 */
export const craneProfilePolicy = {
  canList: (ctx: AuthContext): boolean => ctx.role === 'superadmin',

  canRead: (ctx: AuthContext, profile: Pick<CraneProfile, 'userId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'operator') return ctx.userId === profile.userId
    return false
  },

  /**
   * Admin update identity-полей (ФИО / ИИН / specialization). Rejected profiles —
   * read-only по §4.2b (единственный путь модификации = delete).
   */
  canUpdate: (ctx: AuthContext, profile: Pick<CraneProfile, 'approvalStatus'>): boolean => {
    if (profile.approvalStatus === 'rejected') return false
    return ctx.role === 'superadmin'
  },

  canDelete: (ctx: AuthContext): boolean => ctx.role === 'superadmin',

  /**
   * Approve/reject — строго superadmin (инвариант holding-approval: внешний
   * актор обязателен). Owner не участвует в platform-pipeline'е вообще —
   * его approval-pipeline 2 живёт на organization_operators.
   */
  canApprove: (ctx: AuthContext): boolean => ctx.role === 'superadmin',
  canReject: (ctx: AuthContext): boolean => ctx.role === 'superadmin',

  /**
   * Self-read: оператор читает свой профиль. НЕ фильтрует по approval_status
   * (оператор должен видеть rejection_reason); НЕ фильтрует по статусу найма
   * (этот факт — свойство organization_operator, а не профиля).
   */
  canReadSelf: (ctx: AuthContext, profile: Pick<CraneProfile, 'userId'>): boolean => {
    return ctx.role === 'operator' && ctx.userId === profile.userId
  },

  /**
   * Self-update: whitelist ФИО (см. schemas). approval_status здесь не
   * проверяется — на уровне identity это свойство, а не гейт к чтению/правке
   * собственных ПДН. Полный freeze = deleted_at (repository отсекает).
   */
  canUpdateSelf: (ctx: AuthContext, profile: Pick<CraneProfile, 'userId'>): boolean => {
    return ctx.role === 'operator' && ctx.userId === profile.userId
  },
}
