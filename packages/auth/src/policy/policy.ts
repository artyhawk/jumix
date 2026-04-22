export type UserRole = 'superadmin' | 'owner' | 'operator'

/**
 * AuthContext после B2d-1 (ADR 0003). Ключевое изменение: operator БОЛЬШЕ
 * НЕ несёт `organizationId`. Причина — один человек (crane_profile) работает
 * в N дочках через organization_operators (M:N); JWT не должен предписывать
 * ни одну из них.
 *
 * Per-org операции для operator'а (shifts в конкретной дочке, просмотр
 * условий найма) будут использовать header `X-Organization-Id`, который
 * middleware валидирует против активных organization_operator записей
 * пользователя (B2d-2).
 */
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
      tokenVersion: number
    }

export const isSuperadmin = (ctx: AuthContext): boolean => ctx.role === 'superadmin'
export const isOwner = (ctx: AuthContext): boolean => ctx.role === 'owner'
export const isOperator = (ctx: AuthContext): boolean => ctx.role === 'operator'

/**
 * True только если ctx привязан к СВОЕЙ organization (owner). Для superadmin
 * (без org) и operator (M:N, org не в JWT) — всегда false. Это сознательно:
 * policy-функции не должны «угадывать» org operator'а, это делает service
 * через явный lookup в organization_operators.
 */
export const sameOrganization = (ctx: AuthContext, organizationId: string): boolean =>
  ctx.role === 'owner' && ctx.organizationId === organizationId

export const isSelf = (ctx: AuthContext, userId: string): boolean => ctx.userId === userId

/**
 * Базовый scope для list-запросов в repository.
 * CLAUDE.md §4.1: superadmin → all, owner → by_org. Для operator admin-list
 * запрещён (policy.canList → false); self-scope выражается через
 * `by_crane_profile` где нужны данные, привязанные к профилю пользователя.
 */
export type ListScope =
  | { type: 'all' }
  | { type: 'by_org'; organizationId: string }
  | { type: 'by_crane_profile'; userId: string }

export const tenantListScope = (ctx: AuthContext): ListScope => {
  if (ctx.role === 'superadmin') return { type: 'all' }
  if (ctx.role === 'owner') return { type: 'by_org', organizationId: ctx.organizationId }
  return { type: 'by_crane_profile', userId: ctx.userId }
}
