import { MemoryRateLimiter, RedisRateLimiter } from '@jumix/auth'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import {
  DevStubSmsProvider,
  MobizonSmsProvider,
  type SmsProvider,
} from '../../integrations/mobizon/sms-provider'
import { registerAuthRoutes } from './auth.routes'
import { registerPasswordRoutes } from './password/password.routes'
import { PasswordAuthService } from './password/password.service'
import { registerRefreshRoutes } from './refresh/refresh.routes'
import { RefreshAuthService } from './refresh/refresh.service'
import {
  AuthEventRepository,
  PasswordResetTokenRepository,
  RefreshTokenRepository,
  UserRepository,
} from './repositories'
import { MemorySmsCodeStore, RedisSmsCodeStore, type SmsCodeStore } from './sms/code-store'
import { registerSmsRoutes } from './sms/sms.routes'
import { SmsAuthService, type SmsRateLimiters } from './sms/sms.service'
import { TokenIssuerService } from './token-issuer.service'

type AuthServices = {
  sms: SmsAuthService
  password: PasswordAuthService
  refresh: RefreshAuthService
  tokenIssuer: TokenIssuerService
  authEvents: AuthEventRepository
  userRepo: UserRepository
  refreshRepo: RefreshTokenRepository
  passwordResetRepo: PasswordResetTokenRepository
}

/**
 * Auth-модуль: собирает все сервисы auth-flow и регистрирует маршруты.
 *
 * Выбор backend'ов зависит от наличия Redis:
 *   - есть Redis → RedisRateLimiter + RedisSmsCodeStore (shared, prod-ready)
 *   - нет Redis → MemoryRateLimiter + MemorySmsCodeStore (dev only)
 *
 * SMS-provider:
 *   - есть MOBIZON_API_KEY → MobizonSmsProvider
 *   - иначе → DevStubSmsProvider (пишет в логгер)
 */
const authPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const env = app.appEnv
  const redis = app.redis

  const userRepo = new UserRepository(app.db)
  const refreshRepo = new RefreshTokenRepository(app.db)
  const passwordResetRepo = new PasswordResetTokenRepository(app.db)
  const authEvents = new AuthEventRepository(app.db)

  // Code store
  const codeStore: SmsCodeStore = redis ? new RedisSmsCodeStore(redis) : new MemorySmsCodeStore()

  // Rate limiters: §5.3 CLAUDE.md — 1/60s phone, 5/hour phone, 20/hour IP.
  // RateLimiter API без префиксов — префиксы в ключах формируем в sms.service
  // ("phone:...", "ip:..."), здесь же задаём только конфигурацию окна.
  const makeLimiter = (windowMs: number, maxRequests: number) =>
    redis
      ? new RedisRateLimiter(redis, { windowMs, maxRequests })
      : new MemoryRateLimiter({ windowMs, maxRequests })
  const limiters: SmsRateLimiters = {
    perPhoneCooldown: makeLimiter(60_000, 1),
    perPhoneHourly: makeLimiter(60 * 60_000, 5),
    perIpHourly: makeLimiter(60 * 60_000, 20),
  }

  // SMS provider
  const mobizonKey = process.env.MOBIZON_API_KEY
  const mobizonUrl = process.env.MOBIZON_API_URL ?? 'https://api.mobizon.kz'
  const smsProvider: SmsProvider = mobizonKey
    ? new MobizonSmsProvider(
        {
          apiUrl: mobizonUrl,
          apiKey: mobizonKey,
          from: process.env.MOBIZON_FROM,
        },
        app.log,
      )
    : new DevStubSmsProvider(app.log)

  if (!mobizonKey && env.NODE_ENV === 'production') {
    app.log.error('MOBIZON_API_KEY not set in production — SMS will not be delivered')
  }

  const smsService = new SmsAuthService(
    codeStore,
    smsProvider,
    limiters,
    authEvents,
    userRepo,
    app.log,
  )

  const tokenIssuer = new TokenIssuerService(refreshRepo, userRepo, app.jwtConfig, {
    webSeconds: 30 * 24 * 60 * 60,
    mobileSeconds: 90 * 24 * 60 * 60,
  })

  const passwordService = new PasswordAuthService(
    userRepo,
    authEvents,
    passwordResetRepo,
    refreshRepo,
    tokenIssuer,
    smsProvider,
    limiters,
    app.log,
  )

  const refreshService = new RefreshAuthService(
    refreshRepo,
    userRepo,
    authEvents,
    tokenIssuer,
    app.log,
  )

  app.decorate('authServices', {
    sms: smsService,
    password: passwordService,
    refresh: refreshService,
    tokenIssuer,
    authEvents,
    userRepo,
    refreshRepo,
    passwordResetRepo,
  } satisfies AuthServices)

  await app.register(registerAuthRoutes)
  await app.register(registerSmsRoutes)
  await app.register(registerPasswordRoutes)
  await app.register(registerRefreshRoutes)
}

export default fp(authPlugin, { name: 'auth', dependencies: ['jwt', 'redis', 'authenticate'] })

declare module 'fastify' {
  interface FastifyInstance {
    authServices: AuthServices
  }
}
