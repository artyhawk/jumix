import type { RateLimitConfig, RateLimitResult, RateLimiter } from './limiter'

/**
 * In-memory sliding-window rate limiter. Хранит timestamp'ы запросов на ключ.
 * Подходит для dev / single-process тестов. Для production — RedisRateLimiter.
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly store = new Map<string, number[]>()
  private readonly config: RateLimitConfig
  private readonly now: () => number

  constructor(config: RateLimitConfig, now: () => number = Date.now) {
    this.config = config
    this.now = now
  }

  async check(key: string): Promise<RateLimitResult> {
    const currentMs = this.now()
    const windowStart = currentMs - this.config.windowMs
    const existing = this.store.get(key) ?? []
    // prune expired
    const fresh: number[] = []
    for (const ts of existing) {
      if (ts > windowStart) fresh.push(ts)
    }

    if (fresh.length >= this.config.maxRequests) {
      const oldest = fresh[0] as number
      const resetAtMs = oldest + this.config.windowMs
      this.store.set(key, fresh)
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(resetAtMs),
        retryAfterMs: Math.max(0, resetAtMs - currentMs),
      }
    }

    fresh.push(currentMs)
    this.store.set(key, fresh)
    return {
      allowed: true,
      remaining: this.config.maxRequests - fresh.length,
      resetAt: new Date(currentMs + this.config.windowMs),
    }
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key)
  }

  /**
   * Очищает полностью (для тестов).
   */
  clear(): void {
    this.store.clear()
  }
}
