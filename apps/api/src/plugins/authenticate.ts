import { type AuthContext, AuthError, verifyAccessToken } from '@jumix/auth'
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { AppError } from '../lib/errors'
import { buildAuthContext } from '../modules/auth/auth.context'
import { UserRepository } from '../modules/auth/repositories'

/**
 * authenticate — preHandler для всех защищённых маршрутов.
 *
 * Семь последовательных шагов (CLAUDE.md §5.1 + §4.2):
 *   1. Извлечь raw-токен: Authorization: Bearer <...> ИЛИ cookie `access_token`.
 *   2. Верифицировать подпись + iss/aud/exp через verifyAccessToken.
 *   3. Parsed claims (после schema validation) имеют sub/org/role/tv.
 *   4. Загрузить пользователя из БД одним запросом вместе со status организации.
 *   5. Сверить claims.tv с user.tokenVersion — отсечь обесцененные после logout-all.
 *   6. Отказать при deleted_at IS NOT NULL, status='blocked',
 *      либо (для non-superadmin) organization.status != 'active'.
 *   7. Построить AuthContext (buildAuthContext) и прикрепить к request.ctx.
 *
 * Любой отказ → 401 UNAUTHORIZED с кодом из AuthError.
 */

const COOKIE_NAME = 'access_token'

function extractToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header)
    if (match?.[1]) return match[1].trim()
  }
  const cookie = request.cookies?.[COOKIE_NAME]
  if (cookie) return cookie
  return null
}

function unauthorized(code: string, message: string): AppError {
  return new AppError({ statusCode: 401, code, message })
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const app = request.server

  const raw = extractToken(request)
  if (!raw) throw unauthorized('TOKEN_MISSING', 'Access token is required')

  let claims: Awaited<ReturnType<typeof verifyAccessToken>>
  try {
    claims = await verifyAccessToken(raw, app.jwtConfig)
  } catch (err) {
    if (err instanceof AuthError) {
      throw unauthorized(err.code, err.message)
    }
    throw err
  }

  const userRepo = new UserRepository(app.db)
  const user = await userRepo.findByIdWithOrganization(claims.sub)
  if (!user) throw unauthorized('USER_NOT_FOUND', 'User no longer exists')

  if (user.tokenVersion !== claims.tv) {
    throw unauthorized('TOKEN_VERSION_MISMATCH', 'Access token revoked by logout-all')
  }
  if (user.deletedAt !== null) {
    throw unauthorized('USER_DELETED', 'User account has been deleted')
  }
  if (user.status !== 'active') {
    throw unauthorized('USER_BLOCKED', 'User account is blocked')
  }
  // superadmin и operator живут без primary organization (ADR 0003 — identity
  // pool). Для owner'а наличие active-организации обязательно. Для operator'а
  // per-org-проверки делает requireOrganizationContext (plugin'ом) на каждом
  // per-org endpoint'е — там своя tenant-scoping-логика.
  if (user.role === 'owner' && user.organizationStatus !== 'active') {
    throw unauthorized('ORGANIZATION_INACTIVE', 'Organization is not active')
  }

  let ctx: AuthContext
  try {
    ctx = buildAuthContext(claims, user)
  } catch (err) {
    if (err instanceof AuthError) {
      throw unauthorized(err.code, err.message)
    }
    throw err
  }
  request.ctx = ctx
}

/**
 * Плагин декорирует app.authenticate, чтобы маршруты могли подключать
 * preHandler одной строкой:
 *   app.get('/me', { preHandler: app.authenticate }, handler)
 */
const authenticatePlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.decorate('authenticate', authenticate)
  // request.ctx задаётся в preHandler'е; модульная аугментация типа ниже
  // даёт типобезопасный доступ. decorateRequest не используем —
  // fastify v5 требует совместимый default для discriminated union, а нам
  // он не нужен (поле всегда пишется перед handler'ом при подключённом preHandler).
}

export default fp(authenticatePlugin, {
  name: 'authenticate',
  dependencies: ['jwt'],
})

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    ctx: AuthContext
  }
}
