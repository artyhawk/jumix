import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import {
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from './password.schemas'

/**
 * Password-based auth flow:
 *   - POST /auth/login — phone + password → tokens
 *   - POST /auth/password-reset/request — phone → SMS с 6-digit кодом
 *   - POST /auth/password-reset/confirm — phone + code + newPassword
 *
 * Reset-flow не возвращает новые tokens: после смены пароля все активные
 * refresh/access — revoked. Пользователь должен залогиниться заново. Это
 * стандарт для «forgot password» — принудительный полный sign-out.
 */
export const registerPasswordRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const ip = request.ip
    const ua = request.headers['user-agent'] ?? null

    const { user, tokens } = await app.authServices.password.login({
      phone: body.phone,
      password: body.password,
      clientKind: body.clientKind,
      deviceId: body.deviceId ?? null,
      ipAddress: ip,
      userAgent: ua,
    })

    return reply.send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
      user: {
        id: user.id,
        role: user.role,
        organizationId: user.organizationId,
        name: user.name,
        themeMode: user.themeMode as 'light' | 'dark' | 'system',
      },
    })
  })

  app.post('/auth/password-reset/request', async (request) => {
    const body = passwordResetRequestSchema.parse(request.body)
    await app.authServices.password.requestReset({
      phone: body.phone,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    })
    return { ok: true }
  })

  app.post('/auth/password-reset/confirm', async (request) => {
    const body = passwordResetConfirmSchema.parse(request.body)
    await app.authServices.password.confirmReset({
      phone: body.phone,
      code: body.code,
      newPassword: body.newPassword,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    })
    return { ok: true }
  })
}
