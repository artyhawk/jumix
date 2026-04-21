import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { logoutSchema, refreshSchema } from './refresh.schemas'

/**
 * Refresh + logout.
 *
 *   - POST /auth/refresh — ротация пары (access + refresh) с reuse-detection.
 *   - POST /auth/logout — revoke одного refresh'а (текущего устройства).
 *   - POST /auth/logout-all — revoke всех refresh'ей юзера + invalidate
 *     активных access (через tokenVersion bump). Требует access-токен.
 */
export const registerRefreshRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/auth/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body)
    const tokens = await app.authServices.refresh.rotate({
      presentedToken: body.refreshToken,
      clientKind: body.clientKind,
      deviceId: body.deviceId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    })
    return reply.send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
    })
  })

  app.post('/auth/logout', async (request) => {
    const body = logoutSchema.parse(request.body)
    await app.authServices.refresh.logout({
      presentedToken: body.refreshToken,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    })
    return { ok: true }
  })

  app.post('/auth/logout-all', { preHandler: app.authenticate }, async (request) => {
    await app.authServices.refresh.logoutAll({
      userId: request.ctx.userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    })
    return { ok: true }
  })
}
