import type { FastifyInstance, FastifyPluginAsync } from 'fastify'

/**
 * Auth-маршруты. Пока только `/auth/me` — вернуть текущий AuthContext,
 * полезно для фронтенда (определить роль) и для integration-тестов
 * authenticate-middleware.
 *
 * Остальные эндпоинты (SMS, password, refresh, logout) добавляются в
 * следующих коммитах отдельного модуля.
 */
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
}
