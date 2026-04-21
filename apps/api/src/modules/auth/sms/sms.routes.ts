import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { AppError } from '../../../lib/errors'
import { smsRequestSchema, smsVerifySchema } from './sms.schemas'

/**
 * Маршруты SMS-auth. Регистрируются из auth-плагина.
 * Сервисы берутся из app.authServices (декоратор настраивается плагином).
 */
export const registerSmsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/auth/sms/request', async (request) => {
    const body = smsRequestSchema.parse(request.body)
    const ip = request.ip
    const ua = request.headers['user-agent'] ?? null
    await app.authServices.sms.requestCode(body.phone, ip, ua)
    return { ok: true }
  })

  app.post('/auth/sms/verify', async (request, reply) => {
    const body = smsVerifySchema.parse(request.body)
    const ip = request.ip
    const ua = request.headers['user-agent'] ?? null

    const result = await app.authServices.sms.verifyCode(body.phone, body.code, ip, ua)
    if (!result.userId) {
      // MVP: регистрация через SMS не входит в scope первого релиза —
      // пользователей создаёт owner/superadmin вручную.
      throw new AppError({
        statusCode: 403,
        code: 'USER_NOT_REGISTERED',
        message: 'Phone is not associated with any active user',
      })
    }

    const user = await app.authServices.userRepo.findByIdWithOrganization(result.userId)
    if (!user) {
      throw new AppError({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'User vanished between verify and token issue',
      })
    }

    const tokens = await app.authServices.tokenIssuer.issue({
      user,
      clientKind: body.clientKind,
      deviceId: body.deviceId ?? null,
      ipAddress: ip,
      userAgent: ua,
    })

    // login_success audit
    await app.authServices.authEvents.log({
      userId: user.id,
      eventType: 'login_success',
      phone: user.phone,
      ipAddress: ip,
      userAgent: ua,
      success: true,
      failureReason: null,
      metadata: { method: 'sms' },
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
      },
    })
  })
}
