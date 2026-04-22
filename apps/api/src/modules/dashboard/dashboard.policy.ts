import type { AuthContext } from '@jumix/auth'

/**
 * Dashboard policy. Stats разделены по endpoint'ам:
 *   - /dashboard/stats        → superadmin only (platform-wide)
 *   - /dashboard/owner-stats  → owner only (org-scoped, B3-UI-3b)
 *
 * Operator аналитики не получает — у него mobile shifts/balance в своём кабинете.
 */
export const dashboardPolicy = {
  canViewStats: (ctx: AuthContext): boolean => ctx.role === 'superadmin',
  canViewOwnerStats: (ctx: AuthContext): boolean => ctx.role === 'owner',
}
