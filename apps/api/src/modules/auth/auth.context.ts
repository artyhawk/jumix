import { type AccessTokenClaims, type AuthContext, AuthError } from '@jumix/auth'
import type { User } from '@jumix/db'

/**
 * Собирает AuthContext из verified JWT claims + свежих данных User из БД.
 *
 * Делает ПОСЛЕ того как authenticate-middleware уже проверил:
 *   1. Подпись и формат JWT (verifyAccessToken)
 *   2. Пользователь существует в БД
 *   3. tokenVersion совпадает с claims.tv
 *   4. deleted_at IS NULL, status='active'
 *   5. Organization.status='active' для non-superadmin
 *
 * На этом этапе единственный tricky момент — согласовать role между JWT
 * и БД. Если role в БД изменилась (например, superadmin понизили до owner,
 * но его access-токен ещё живой) — это повод 401, иначе атакующий может
 * с украденным старым JWT получить доступ с повышенными правами.
 *
 * Используем role из БД (источник истины) и инвариант
 * users_org_role_consistency_chk гарантирует правильный пар (role, orgId).
 */
export function buildAuthContext(claims: AccessTokenClaims, user: User): AuthContext {
  if (claims.role !== user.role) {
    throw new AuthError('TOKEN_INVALID', 'Role in token does not match current role')
  }

  if (user.role === 'superadmin') {
    if (user.organizationId !== null) {
      // БД check constraint это гарантирует, но belt-and-suspenders.
      throw new AuthError('TOKEN_INVALID', 'superadmin must have no organization')
    }
    return {
      role: 'superadmin',
      userId: user.id,
      organizationId: null,
      tokenVersion: user.tokenVersion,
    }
  }

  if (!user.organizationId) {
    throw new AuthError('TOKEN_INVALID', `${user.role} must have an organization`)
  }

  return {
    role: user.role,
    userId: user.id,
    organizationId: user.organizationId,
    tokenVersion: user.tokenVersion,
  }
}
