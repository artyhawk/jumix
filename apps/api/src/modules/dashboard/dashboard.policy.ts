import type { AuthContext } from '@jumix/auth'

/**
 * Dashboard stats доступна только суперадмину. Owner'у и operator'у в MVP
 * аналитики нет — только специфичные для их кабинетов endpoint'ы.
 */
export const dashboardPolicy = {
  canViewStats: (ctx: AuthContext): boolean => ctx.role === 'superadmin',
}
