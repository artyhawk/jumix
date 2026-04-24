import type { AuthContext } from '@jumix/auth'
import type { Shift } from '@jumix/db'

/**
 * Shift policy (M4). Pure functions — БД не трогают.
 *
 * Roles:
 *   operator   — создаёт/управляет только СВОИМИ shift'ами (operatorId === ctx.userId).
 *                canStart — единственный способ создать shift (owner/superadmin
 *                не могут «начать смену за крановщика» в MVP).
 *   owner      — read-only для shift'ов своей организации. Не может менять
 *                статус (business rule: только сам оператор определяет когда
 *                смена закончилась — иначе manipulation потенциал).
 *   superadmin — read all (platform observability); mutation нет.
 */
export const shiftPolicy = {
  canStart: (ctx: AuthContext): boolean => ctx.role === 'operator',

  canRead: (ctx: AuthContext, shift: Pick<Shift, 'operatorId' | 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === shift.organizationId
    if (ctx.role === 'operator') return ctx.userId === shift.operatorId
    return false
  },

  /**
   * Смена статуса (pause/resume/end) — только оператор-владелец shift'а.
   * Owner/superadmin не могут менять за оператора — business invariant.
   */
  canChangeStatus: (ctx: AuthContext, shift: Pick<Shift, 'operatorId'>): boolean => {
    if (ctx.role !== 'operator') return false
    return ctx.userId === shift.operatorId
  },

  canListOrg: (ctx: AuthContext): boolean => ctx.role === 'owner' || ctx.role === 'superadmin',

  canListMy: (ctx: AuthContext): boolean => ctx.role === 'operator',

  canListAvailableCranes: (ctx: AuthContext): boolean => ctx.role === 'operator',
}
