import { THEME_MODES } from '@jumix/shared'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../lib/errors'

/**
 * Identity-маршруты (auth + per-user preferences):
 *   - GET   /auth/me            — текущий AuthContext (без DB-lookup)
 *   - PATCH /me/preferences     — update theme preference (B3-THEME)
 *
 * Остальные auth-flow endpoints (SMS, password, refresh, logout) — отдельные
 * routes в этом же модуле.
 */
const updatePreferencesSchema = z.object({
  themeMode: z.enum(THEME_MODES),
})

export const registerAuthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/auth/me', { preHandler: app.authenticate }, async (request) => {
    const { ctx } = request
    return {
      userId: ctx.userId,
      organizationId: ctx.role === 'operator' ? null : ctx.organizationId,
      role: ctx.role,
      tokenVersion: ctx.tokenVersion,
    }
  })

  app.patch('/me/preferences', { preHandler: app.authenticate }, async (request) => {
    const body = updatePreferencesSchema.parse(request.body)
    const updated = await app.authServices.userRepo.updateThemeMode(
      request.ctx.userId,
      body.themeMode,
    )
    if (!updated) {
      throw new AppError({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      })
    }
    return {
      user: {
        id: updated.id,
        role: updated.role,
        organizationId: updated.organizationId,
        name: updated.name,
        themeMode: updated.themeMode as 'light' | 'dark' | 'system',
      },
    }
  })
}
