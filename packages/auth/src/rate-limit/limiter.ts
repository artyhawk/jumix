export type RateLimitResult =
  | {
      allowed: true
      /** Сколько запросов осталось до исчерпания окна. */
      remaining: number
      /** Когда текущее окно сбрасывается. */
      resetAt: Date
    }
  | {
      allowed: false
      remaining: 0
      resetAt: Date
      /** Сколько миллисекунд ждать до следующей попытки. */
      retryAfterMs: number
    }

export type RateLimitConfig = {
  /** Ширина окна в миллисекундах (sliding window). */
  windowMs: number
  /** Максимум запросов в окне. */
  maxRequests: number
}

/**
 * Интерфейс rate-лимитера. Используется в api-слое для SMS, password login,
 * IP-based ограничений (CLAUDE.md §5.3).
 *
 * Реализации:
 * - MemoryRateLimiter — для dev и тестов
 * - RedisRateLimiter — для production (кластер-безопасный sliding window)
 */
export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>
  reset(key: string): Promise<void>
}
