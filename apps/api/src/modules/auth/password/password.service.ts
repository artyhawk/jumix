import type { MemoryRateLimiter, RateLimiter } from '@jumix/auth'
import { hashPassword, needsRehash, verifyPassword } from '@jumix/auth'
import type { User } from '@jumix/db'
import type { FastifyBaseLogger } from 'fastify'
import type { SmsProvider } from '../../../integrations/mobizon/sms-provider'
import { AppError } from '../../../lib/errors'
import type {
  AuthEventRepository,
  PasswordResetTokenRepository,
  RefreshTokenRepository,
  UserRepository,
} from '../repositories'
import { generateSmsCode, hashSmsCode } from '../sms/code-store'
import type { SmsRateLimiters } from '../sms/sms.service'
import type { ClientKind, IssuedTokens, TokenIssuerService } from '../token-issuer.service'

/**
 * Политика login-backoff (§5.3 CLAUDE.md):
 *   - считаем `login_failure` события за последние 15 минут на этот phone
 *   - если >= LOGIN_LOCKOUT_THRESHOLD (10) → 429 ACCOUNT_LOCKED на 15 минут
 *   - между 5 и 10 failures — клиент должен сам вводить паузу (мы возвращаем
 *     метаданные `failureCount` в audit, но не в ответ — не помогаем атакующему
 *     калибровать retry-интервал)
 *
 * argon2id verify сам по себе медленный (~100 ms), поэтому онлайн brute-force
 * ограничен даже без дополнительных задержек.
 */
export const LOGIN_FAIL_LOOKBACK_MINUTES = 15
export const LOGIN_LOCKOUT_THRESHOLD = 10

/** §5.3: password-reset TTL. 10 минут — стандарт для one-shot recovery flow. */
export const PASSWORD_RESET_CODE_TTL_SECONDS = 10 * 60

export type LoginInput = {
  phone: string
  password: string
  clientKind: ClientKind
  deviceId: string | null
  ipAddress: string
  userAgent: string | null
}

export type LoginResult = {
  user: User
  tokens: IssuedTokens
}

export type PasswordResetContext = {
  phone: string
  ipAddress: string
  userAgent: string | null
}

export class PasswordAuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly authEvents: AuthEventRepository,
    private readonly resetTokens: PasswordResetTokenRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly tokenIssuer: TokenIssuerService,
    private readonly smsProvider: SmsProvider,
    private readonly smsLimiters: SmsRateLimiters,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * POST /auth/login.
   *
   * Инвариант: все failure-пути возвращают **одинаковый** INVALID_CREDENTIALS
   * (enumeration protection). В audit_log пишем конкретную причину для ops.
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const { phone, password, clientKind, deviceId, ipAddress, userAgent } = input

    // 1. Account-lock check перед тяжёлой верификацией argon2.
    const since = new Date(Date.now() - LOGIN_FAIL_LOOKBACK_MINUTES * 60_000)
    const failuresInWindow = await this.authEvents.countByPhoneSince(phone, 'login_failure', since)
    if (failuresInWindow >= LOGIN_LOCKOUT_THRESHOLD) {
      await this.authEvents.log({
        userId: null,
        eventType: 'login_failure',
        phone,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'account_locked',
        metadata: { failuresInWindow },
      })
      throw new AppError({
        statusCode: 429,
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed login attempts. Try again later.',
        details: { retryAfterSeconds: LOGIN_FAIL_LOOKBACK_MINUTES * 60 },
      })
    }

    // 2. User lookup + статус-guard.
    const user = await this.users.findActiveByPhone(phone)
    if (!user || !user.passwordHash) {
      await this.failLogin(phone, ipAddress, userAgent, null, 'user_not_found_or_no_password')
      throw this.invalidCredentials()
    }
    if (user.status !== 'active') {
      await this.failLogin(phone, ipAddress, userAgent, user.id, 'user_blocked')
      throw this.invalidCredentials()
    }

    // 3. Verify password (argon2id, constant-time внутри).
    const ok = await verifyPassword(user.passwordHash, password)
    if (!ok) {
      await this.failLogin(phone, ipAddress, userAgent, user.id, 'wrong_password')
      // Если этой ошибкой перешагнули lockout-threshold — явный account_locked
      // event. Следующие попытки сразу получат 429, не доходя до verify.
      if (failuresInWindow + 1 >= LOGIN_LOCKOUT_THRESHOLD) {
        await this.authEvents.log({
          userId: user.id,
          eventType: 'account_locked',
          phone,
          ipAddress,
          userAgent,
          success: false,
          failureReason: 'threshold_reached',
          metadata: { failuresInWindow: failuresInWindow + 1 },
        })
      }
      throw this.invalidCredentials()
    }

    // 4. Transparent rehash (OWASP rotation) — молча пересчитываем хэш, если
    // параметры argon2 поменялись.
    if (await needsRehash(user.passwordHash)) {
      try {
        const newHash = await hashPassword(password)
        await this.users.updatePasswordHash(user.id, newHash)
      } catch (err) {
        // Не падаем: rehash — best-effort оптимизация. Логируем и идём дальше.
        this.log.warn({ err, userId: user.id }, 'password rehash failed')
      }
    }

    // 5. Выдаём tokens.
    const tokens = await this.tokenIssuer.issue({
      user,
      clientKind,
      deviceId,
      ipAddress,
      userAgent,
    })

    await this.authEvents.log({
      userId: user.id,
      eventType: 'login_success',
      phone,
      ipAddress,
      userAgent,
      success: true,
      failureReason: null,
      metadata: { method: 'password' },
    })

    return { user, tokens }
  }

  /**
   * POST /auth/password-reset/request.
   *
   * Всегда возвращаем 200 (enumeration protection) ЕСЛИ прошли rate-limit.
   * SMS отправляется только если пользователь реально существует и активен.
   *
   * Rate-limit использует тот же ключ-namespace что и SMS-login: фактически
   * один phone → один SMS в 60 секунд вне зависимости от того, login это
   * или reset (обе трассы одинаково нагружают Mobizon-шлюз).
   */
  async requestReset(ctx: PasswordResetContext): Promise<void> {
    const { phone, ipAddress, userAgent } = ctx

    // Rate-limit проверяем ДО user lookup — иначе attacker'у можно заставить
    // сервер бесплатно искать по всем phone'ам.
    const checks: Array<{ name: string; limiter: RateLimiter | MemoryRateLimiter; key: string }> = [
      {
        name: 'cooldown',
        limiter: this.smsLimiters.perPhoneCooldown,
        key: `sms:cd:phone:${phone}`,
      },
      {
        name: 'hourlyPhone',
        limiter: this.smsLimiters.perPhoneHourly,
        key: `sms:hr:phone:${phone}`,
      },
      { name: 'hourlyIp', limiter: this.smsLimiters.perIpHourly, key: `sms:hr:ip:${ipAddress}` },
    ]
    for (const { name, limiter, key } of checks) {
      const result = await limiter.check(key)
      if (!result.allowed) {
        await this.authEvents.log({
          userId: null,
          eventType: 'password_reset_requested',
          phone,
          ipAddress,
          userAgent,
          success: false,
          failureReason: `rate_limited:${name}`,
          metadata: { retryAfterMs: result.retryAfterMs ?? null },
        })
        throw new AppError({
          statusCode: 429,
          code: 'RATE_LIMITED',
          message: 'Too many reset requests',
          details: { reason: name, retryAfterMs: result.retryAfterMs ?? null },
        })
      }
    }

    const user = await this.users.findActiveByPhone(phone)
    if (!user) {
      // Uniform OK response — но аудитим для ops аномалий
      // (много requests на phone которого нет → попытка enumeration).
      await this.authEvents.log({
        userId: null,
        eventType: 'password_reset_requested',
        phone,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'user_not_found',
        metadata: {},
      })
      return
    }
    if (user.status !== 'active') {
      await this.authEvents.log({
        userId: user.id,
        eventType: 'password_reset_requested',
        phone,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'user_blocked',
        metadata: {},
      })
      return
    }

    const code = generateSmsCode()
    // hashSmsCode → hex, нам нужен Buffer для bytea-колонки.
    const tokenHash = Buffer.from(hashSmsCode(phone, code), 'hex')
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_CODE_TTL_SECONDS * 1000)

    await this.resetTokens.insert({
      userId: user.id,
      tokenHash,
      expiresAt,
    })

    try {
      await this.smsProvider.send({
        phone,
        text: `Jumix: код восстановления пароля ${code}. Действителен ${PASSWORD_RESET_CODE_TTL_SECONDS / 60} минут.`,
      })
    } catch (err) {
      // Молча логируем и возвращаем 200 — не хотим раскрывать, что phone есть
      // в системе, даже через канал "провайдер упал". Клиент не получит код,
      // повторит запрос через 60 сек (cooldown отработал).
      this.log.warn({ err, phone, provider: this.smsProvider.name }, 'password reset SMS failed')
      await this.authEvents.log({
        userId: user.id,
        eventType: 'password_reset_requested',
        phone,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'delivery_failed',
        metadata: {},
      })
      return
    }

    await this.authEvents.log({
      userId: user.id,
      eventType: 'password_reset_requested',
      phone,
      ipAddress,
      userAgent,
      success: true,
      failureReason: null,
      metadata: { provider: this.smsProvider.name },
    })
  }

  /**
   * POST /auth/password-reset/confirm.
   *
   * При успехе:
   *   1. markUsed(token) — один код → один reset.
   *   2. updatePasswordHash.
   *   3. revokeAllForUser('logout_all') — все старые refresh невалидны.
   *   4. incrementTokenVersion — все старые access токены невалидны.
   *
   * Order важен: сначала invalidate доступа (даже если пароль не обновится —
   * ситуация безопасная), потом пересчитываем пароль. Но updatePasswordHash
   * → это просто UPDATE; ошибка тут скорее всего невосстановима, и safer
   * иметь signed-out состояние чем залогиненного с не-обновлённым паролем.
   */
  async confirmReset(input: {
    phone: string
    code: string
    newPassword: string
    ipAddress: string
    userAgent: string | null
  }): Promise<void> {
    const { phone, code, newPassword, ipAddress, userAgent } = input

    const tokenHash = Buffer.from(hashSmsCode(phone, code), 'hex')
    const token = await this.resetTokens.findByHash(tokenHash)
    if (!token) {
      await this.logResetFail(phone, ipAddress, userAgent, null, 'invalid_code')
      throw this.invalidResetToken()
    }
    if (token.usedAt) {
      await this.logResetFail(phone, ipAddress, userAgent, token.userId, 'already_used')
      throw this.invalidResetToken()
    }
    if (token.expiresAt.getTime() <= Date.now()) {
      await this.logResetFail(phone, ipAddress, userAgent, token.userId, 'expired')
      throw this.invalidResetToken()
    }

    // hashPassword кидает PASSWORD_TOO_SHORT — но Zod уже отсёк короткие,
    // так что тут это просто защита от bypass'а схемы.
    const newHash = await hashPassword(newPassword)

    await this.resetTokens.markUsed(token.id)
    await this.users.updatePasswordHash(token.userId, newHash)
    await this.refreshTokens.revokeAllForUser(token.userId, 'logout_all')
    await this.users.incrementTokenVersion(token.userId)

    await this.authEvents.log({
      userId: token.userId,
      eventType: 'password_reset_completed',
      phone,
      ipAddress,
      userAgent,
      success: true,
      failureReason: null,
      metadata: {},
    })
  }

  private async failLogin(
    phone: string,
    ipAddress: string,
    userAgent: string | null,
    userId: string | null,
    reason: string,
  ): Promise<void> {
    await this.authEvents.log({
      userId,
      eventType: 'login_failure',
      phone,
      ipAddress,
      userAgent,
      success: false,
      failureReason: reason,
      metadata: {},
    })
  }

  private async logResetFail(
    phone: string,
    ipAddress: string,
    userAgent: string | null,
    userId: string | null,
    reason: string,
  ): Promise<void> {
    await this.authEvents.log({
      userId,
      eventType: 'password_reset_completed',
      phone,
      ipAddress,
      userAgent,
      success: false,
      failureReason: reason,
      metadata: {},
    })
  }

  private invalidCredentials(): AppError {
    return new AppError({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid phone or password',
    })
  }

  private invalidResetToken(): AppError {
    return new AppError({
      statusCode: 400,
      code: 'PASSWORD_RESET_INVALID',
      message: 'Password reset code is invalid or expired',
    })
  }
}
