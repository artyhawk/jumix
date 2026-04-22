/**
 * Типы, отзеркаливающие backend-контракты. Обновлять руками при изменении API;
 * когда появится сгенерированный OpenAPI — заменить на импорт из `@jumix/api-types`.
 */

export type UserRole = 'superadmin' | 'owner' | 'operator'
export type ClientKind = 'web' | 'mobile'

/** Пользователь как его возвращают login/verify эндпоинты. */
export interface AuthUser {
  id: string
  role: UserRole
  organizationId: string | null
  name: string
}

/** Ответ SMS verify / password login. */
export interface LoginResponse {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
  user: AuthUser
}

/** Ответ POST /auth/refresh — только пара токенов. */
export interface RefreshResponse {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
}

/** GET /auth/me — минимальный контекст. */
export interface AuthMeResponse {
  userId: string
  organizationId: string | null
  role: UserRole
  tokenVersion: number
}
