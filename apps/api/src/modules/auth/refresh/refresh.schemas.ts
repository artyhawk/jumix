import { z } from 'zod'

/**
 * POST /auth/refresh. Refresh-токен передаётся в теле запроса.
 * На вебе это будет дублироваться в httpOnly cookie /api/auth/refresh
 * (§5.2), но тело — canonical источник для унификации с мобилкой.
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(16).max(512),
  clientKind: z.enum(['web', 'mobile']).default('web'),
  deviceId: z.string().max(128).optional(),
})
export type RefreshBody = z.infer<typeof refreshSchema>

/** POST /auth/logout — отзывает именно этот refresh (web/mobile — один токен). */
export const logoutSchema = z.object({
  refreshToken: z.string().min(16).max(512),
})
export type LogoutBody = z.infer<typeof logoutSchema>
