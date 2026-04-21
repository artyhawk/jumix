export type UserRole = 'superadmin' | 'owner' | 'operator'

export type AuthContext =
  | {
      role: 'superadmin'
      userId: string
      organizationId: null
      tokenVersion: number
    }
  | {
      role: 'owner'
      userId: string
      organizationId: string
      tokenVersion: number
    }
  | {
      role: 'operator'
      userId: string
      organizationId: string
      tokenVersion: number
    }

export const isSuperadmin = (ctx: AuthContext): boolean => ctx.role === 'superadmin'
export const isOwner = (ctx: AuthContext): boolean => ctx.role === 'owner'
export const isOperator = (ctx: AuthContext): boolean => ctx.role === 'operator'

export const sameOrganization = (ctx: AuthContext, organizationId: string): boolean =>
  ctx.organizationId !== null && ctx.organizationId === organizationId

export const isSelf = (ctx: AuthContext, userId: string): boolean => ctx.userId === userId

/**
 * Базовый scope для list-запросов в repository.
 * CLAUDE.md §4.1: superadmin → all, owner → by_org, operator → by_user.
 */
export type ListScope =
  | { type: 'all' }
  | { type: 'by_org'; organizationId: string }
  | { type: 'by_user'; userId: string }

export const tenantListScope = (ctx: AuthContext): ListScope => {
  if (ctx.role === 'superadmin') return { type: 'all' }
  if (ctx.role === 'owner') return { type: 'by_org', organizationId: ctx.organizationId }
  return { type: 'by_user', userId: ctx.userId }
}
