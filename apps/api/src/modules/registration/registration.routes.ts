import type { CraneProfile } from '@jumix/db'
import { maskPhone } from '@jumix/shared'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { startRegistrationSchema, verifyRegistrationSchema } from './registration.schemas'

/**
 * Public registration endpoints (ADR 0004). Обе ручки БЕЗ `app.authenticate`.
 *
 *   POST /api/v1/registration/start   — отправить OTP на телефон.
 *   POST /api/v1/registration/verify  — проверить OTP, создать user + профиль,
 *                                         выдать JWT-пару.
 *
 * Префикс `/api/v1/registration` чтобы отделить от `/auth/*` login-flow:
 * регистрация — это другая операция с другим DTO-контрактом.
 */
export const registerRegistrationRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.post('/start', async (request, reply) => {
        const body = startRegistrationSchema.parse(request.body)
        const result = await app.registrationService.start(body, {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        })
        // 202 Accepted: request accepted, SMS sent asynchronously.
        return reply.code(202).send(result)
      })

      scoped.post('/verify', async (request, reply) => {
        const body = verifyRegistrationSchema.parse(request.body)
        const result = await app.registrationService.verify(body, {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
          clientKind: body.clientKind,
          deviceId: body.deviceId ?? null,
        })
        return reply.code(201).send({
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessTokenExpiresAt: result.tokens.accessTokenExpiresAt.toISOString(),
          refreshTokenExpiresAt: result.tokens.refreshTokenExpiresAt.toISOString(),
          user: {
            id: result.user.id,
            role: result.user.role,
            organizationId: result.user.organizationId,
            name: result.user.name,
            themeMode: result.user.themeMode as 'light' | 'dark' | 'system',
          },
          craneProfile: toRegistrationCraneProfileDTO(result.craneProfile, result.user.phone),
        })
      })
    },
    { prefix: '/api/v1/registration' },
  )
}

type RegistrationCraneProfileDTO = {
  id: string
  userId: string
  firstName: string
  lastName: string
  patronymic: string | null
  iin: string
  phone: string
  specialization: Record<string, unknown>
  approvalStatus: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
}

function toRegistrationCraneProfileDTO(
  profile: CraneProfile,
  userPhone: string,
): RegistrationCraneProfileDTO {
  return {
    id: profile.id,
    userId: profile.userId,
    firstName: profile.firstName,
    lastName: profile.lastName,
    patronymic: profile.patronymic,
    iin: profile.iin,
    phone: maskPhone(userPhone),
    specialization: profile.specialization,
    approvalStatus: profile.approvalStatus,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  }
}
