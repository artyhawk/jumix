import type { AuthContext } from '@jumix/auth'

/**
 * Survey policy (B3-SURVEY).
 *
 * Public submission — без auth (rate-limited + honeypot, см. routes).
 * Admin views — superadmin only. Owner / operator не получают доступа к
 * customer development data (это lead-pool, не часть org-операций).
 */
export const surveyPolicy = {
  canViewAdmin: (ctx: AuthContext): boolean => ctx.role === 'superadmin',
}
