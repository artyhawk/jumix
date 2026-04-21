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
  app.get('/auth/me', { preHandler: app.authenticate }, async (request) => ({
    userId: request.ctx.userId,
    organizationId: request.ctx.organizationId,
    role: request.ctx.role,
    tokenVersion: request.ctx.tokenVersion,
  }))
}
