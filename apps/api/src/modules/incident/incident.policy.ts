import type { AuthContext } from '@jumix/auth'
import type { Incident } from '@jumix/db'

/**
 * Incident policy (M6, ADR 0008). Pure functions — БД не трогают.
 *
 * Roles:
 *   operator   — создаёт incidents, видит свои.
 *   owner      — read-only видит incidents своей организации;
 *                acknowledge/resolve/escalate — управляет жизненным циклом.
 *   superadmin — read all; resolve/escalate/de-escalate (легально, всё-таки
 *                escalation путь к платформе).
 *
 * Policy на mutation проверяет состояние entity (например, нельзя resolve
 * уже resolved'ый) — service-слой страхует race ещё одним check'ом WHERE.
 */
export const incidentPolicy = {
  canCreate: (ctx: AuthContext): boolean => ctx.role === 'operator',

  canViewOwn: (
    ctx: AuthContext,
    inc: Pick<Incident, 'reporterUserId' | 'organizationId'>,
  ): boolean => ctx.role === 'operator' && inc.reporterUserId === ctx.userId,

  canViewOrg: (ctx: AuthContext, inc: Pick<Incident, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === inc.organizationId
    return false
  },

  /** Composite: operator(own) | owner(org) | superadmin(all). */
  canRead: (
    ctx: AuthContext,
    inc: Pick<Incident, 'reporterUserId' | 'organizationId'>,
  ): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === inc.organizationId
    if (ctx.role === 'operator') return ctx.userId === inc.reporterUserId
    return false
  },

  canAcknowledge: (ctx: AuthContext, inc: Pick<Incident, 'organizationId' | 'status'>): boolean => {
    if (inc.status !== 'submitted') return false
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === inc.organizationId
    return false
  },

  /** Resolve разрешён из submitted/acknowledged/escalated (last — superadmin only). */
  canResolve: (ctx: AuthContext, inc: Pick<Incident, 'organizationId' | 'status'>): boolean => {
    if (inc.status === 'resolved') return false
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') {
      if (inc.status === 'escalated') return false // только superadmin закрывает escalated
      return ctx.organizationId === inc.organizationId
    }
    return false
  },

  /** Escalate — только owner, и только если incident в org owner'а и не уже escalated/resolved. */
  canEscalate: (ctx: AuthContext, inc: Pick<Incident, 'organizationId' | 'status'>): boolean => {
    if (ctx.role !== 'owner') return false
    if (inc.organizationId !== ctx.organizationId) return false
    return inc.status === 'submitted' || inc.status === 'acknowledged'
  },

  /** De-escalate — только superadmin восстанавливает escalated → acknowledged. */
  canDeEscalate: (ctx: AuthContext, inc: Pick<Incident, 'status'>): boolean =>
    ctx.role === 'superadmin' && inc.status === 'escalated',

  canListOrg: (ctx: AuthContext): boolean => ctx.role === 'owner' || ctx.role === 'superadmin',

  canListMy: (ctx: AuthContext): boolean => ctx.role === 'operator',
}
