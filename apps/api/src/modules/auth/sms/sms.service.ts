import type { MemoryRateLimiter, RateLimiter } from '@jumix/auth'
import type { FastifyBaseLogger } from 'fastify'
import type { SmsProvider } from '../../../integrations/mobizon/sms-provider'
import { AppError } from '../../../lib/errors'
import type { AuthEventRepository, UserRepository } from '../repositories'
import { type SmsCodeStore, constantTimeEqualHex, generateSmsCode, hashSmsCode } from './code-store'

/**
 * Rate-limit стратегия (§5.3 CLAUDE.md):
 *   - cooldown:   1 request per 60 seconds per phone
 *   - hourly:     5 requests per hour per phone
 *   - ip:         20 requests per hour per IP
 *   - verify:     5 попыток на один выписанный код, потом exhaust
 *
 * Ограничения хранятся в SlidingWindowLimiter (Redis в prod, Memory в dev).
 * Счётчики доступны через `checkAll` — все лимиты проверяются последовательно;
 * первый неудачный → отказ с указанием `retryAfter`.
 */
export type SmsRateLimiters = {
  perPhoneCooldown: RateLimiter | MemoryRateLimiter
  perPhoneHourly: RateLimiter | MemoryRateLimiter
  perIpHourly: RateLimiter | MemoryRateLimiter
}

export const SMS_CODE_TTL_SECONDS = 5 * 60 // 5 минут
export const MAX_VERIFY_ATTEMPTS = 5

export class SmsAuthService {
  constructor(
    private readonly codeStore: SmsCodeStore,
    private readonly provider: SmsProvider,
    private readonly limiters: SmsRateLimiters,
    private readonly authEvents: AuthEventRepository,
    private readonly users: UserRepository,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * POST /auth/sms/request — сгенерировать и отправить SMS.
   *
   * Последовательность:
   *   1. Rate-limit cooldown (phone), hourly (phone), hourly (IP). При отказе
   *      → 429 RATE_LIMITED с Retry-After.
   *   2. Генерация 6-значного кода, put в store (старый перетирается).
   *   3. Отправка через SmsProvider. Ошибка отправки → 502 SMS_DELIVERY_FAILED
   *      (код в store остаётся, но cooldown уже списан — это намеренно,
   *      иначе повтор в ту же секунду бесплатный bypass лимита).
   *   4. Log auth_events { type:'sms_requested', success, phone, ip }.
   *
   * Важно: НЕ раскрываем существует ли пользователь с этим phone. SMS
   * отправляется всегда (для регистрации / восстановления доступа тоже).
   */
  async requestCode(phone: string, ipAddress: string, userAgent: string | null): Promise<void> {
    // Ключи уникализируем по лимитеру — чтобы при Redis-backend'е три окна
    // не писали в один ZSET. Memory-backend не смешивает (отдельный Map),
    // но префикс не мешает.
    const checks: Array<{ name: string; limiter: RateLimiter | MemoryRateLimiter; key: string }> = [
      { name: 'cooldown', limiter: this.limiters.perPhoneCooldown, key: `sms:cd:phone:${phone}` },
      {
        name: 'hourlyPhone',
        limiter: this.limiters.perPhoneHourly,
        key: `sms:hr:phone:${phone}`,
      },
      { name: 'hourlyIp', limiter: this.limiters.perIpHourly, key: `sms:hr:ip:${ipAddress}` },
    ]
    for (const { name, limiter, key } of checks) {
      const result = await limiter.check(key)
      if (!result.allowed) {
        await this.authEvents.log({
          userId: null,
          eventType: 'sms_requested',
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
          message: 'Too many SMS requests',
          details: { reason: name, retryAfterMs: result.retryAfterMs ?? null },
        })
      }
    }

    const code = generateSmsCode()
    await this.codeStore.put(phone, code, SMS_CODE_TTL_SECONDS)

    try {
      await this.provider.send({
        phone,
        text: `Jumix: ваш код подтверждения ${code}. Никому не сообщайте.`,
      })
    } catch (err) {
      this.log.warn({ err, phone, provider: this.provider.name }, 'sms delivery failed')
      await this.authEvents.log({
        userId: null,
        eventType: 'sms_requested',
        phone,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'delivery_failed',
        metadata: {},
      })
      throw new AppError({
        statusCode: 502,
        code: 'SMS_DELIVERY_FAILED',
        message: 'Could not send SMS right now, try again later',
      })
    }

    await this.authEvents.log({
      userId: null,
      eventType: 'sms_requested',
      phone,
      ipAddress,
      userAgent,
      success: true,
      failureReason: null,
      metadata: { provider: this.provider.name },
    })
  }

  /**
   * POST /auth/sms/verify — проверить код и вернуть userId если он есть.
   *
   * Контракт: возвращает `{ userId, isExisting }`:
   *   - `userId: string` когда пользователь найден — caller выдаёт tokens.
   *   - `userId: null, isExisting: false` — код верный, но пользователя с
   *     этим phone нет (на будущее — signup flow; в MVP пока 403).
   *
   * Безопасность:
   *   - constant-time сравнение хэшей (timingSafeEqual).
   *   - после MAX_VERIFY_ATTEMPTS ошибок код удаляется из store (чтобы
   *     атакующий не мог brute-force'ить 10^6 вариантов).
   *   - любая ошибка (нет кода, expired, invalid, attempts-exceeded) —
   *     один код наружу: INVALID_OR_EXPIRED. Не палим какой именно случай.
   */
  async verifyCode(
    phone: string,
    code: string,
    ipAddress: string,
    userAgent: string | null,
  ): Promise<{ userId: string | null; isExisting: boolean }> {
    const entry = await this.codeStore.get(phone)
    if (!entry) {
      await this.logFail(phone, ipAddress, userAgent, 'no_code_or_expired')
      throw this.invalidOrExpired()
    }
    if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
      await this.codeStore.delete(phone)
      await this.logFail(phone, ipAddress, userAgent, 'too_many_attempts')
      throw this.invalidOrExpired()
    }

    const candidateHash = hashSmsCode(phone, code)
    const match = constantTimeEqualHex(entry.codeHash, candidateHash)
    if (!match) {
      const attempts = await this.codeStore.incrementAttempts(phone)
      await this.logFail(phone, ipAddress, userAgent, 'wrong_code', { attempts })
      throw this.invalidOrExpired()
    }

    // Успех — сжигаем код.
    await this.codeStore.delete(phone)

    const user = await this.users.findActiveByPhone(phone)
    await this.authEvents.log({
      userId: user?.id ?? null,
      eventType: 'sms_verified',
      phone,
      ipAddress,
      userAgent,
      success: true,
      failureReason: null,
      metadata: {},
    })
    if (!user) {
      return { userId: null, isExisting: false }
    }
    return { userId: user.id, isExisting: true }
  }

  private async logFail(
    phone: string,
    ipAddress: string,
    userAgent: string | null,
    reason: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.authEvents.log({
      userId: null,
      eventType: 'sms_verify_failed',
      phone,
      ipAddress,
      userAgent,
      success: false,
      failureReason: reason,
      metadata,
    })
  }

  private invalidOrExpired(): AppError {
    return new AppError({
      statusCode: 400,
      code: 'SMS_CODE_INVALID_OR_EXPIRED',
      message: 'SMS code is invalid or expired',
    })
  }
}
