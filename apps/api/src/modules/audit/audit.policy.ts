import type { AuthContext } from '@jumix/auth'

/**
 * Audit log read — только суперадмин. Owner/operator не видят platform-wide
 * журнал (per-entity history — отдельная backlog-задача).
 */
export const auditPolicy = {
  canViewRecent: (ctx: AuthContext): boolean => ctx.role === 'superadmin',
}
