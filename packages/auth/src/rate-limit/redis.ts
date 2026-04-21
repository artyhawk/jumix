/**
 * Redis-backed sliding window rate limiter.
 *
 * NOTE: unit-тестами в @jumix/auth НЕ покрыт намеренно. Покрытие —
 * integration-тестами в apps/api через Testcontainers + настоящий Redis.
 * Причина: корректность Lua-скрипта зависит от семантики ZSET/PEXPIRE,
 * mock Redis её не воспроизводит верно. Если меняется Lua ниже —
 * обновить соответствующий integration-тест в apps/api.
 */
import { randomUUID } from 'node:crypto'
import type { RateLimitConfig, RateLimitResult, RateLimiter } from './limiter'

/**
 * Минимальный контракт Redis-клиента. Совместим с ioredis и node-redis.
 * Пакет @jumix/auth не зависит от конкретной библиотеки — клиент инжектится.
 */
export interface RedisLikeClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>
  del(...keys: string[]): Promise<number>
}

/**
 * Lua-скрипт атомарного sliding window на ZSET.
 * Используем score = epoch ms, member = `${score}-${uuid}` (uuid избегает коллизий
 * при нескольких запросах в одну миллисекунду).
 *
 * Возвращает массив [allowed, remaining, resetAtMs]:
 *   allowed = 1 | 0
 *   remaining = сколько запросов осталось в окне после этого
 *   resetAtMs = когда окно сдвинется настолько, что освободится слот
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local maxReq = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= maxReq then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = tonumber(oldest[2]) + window
  return { 0, 0, resetAt }
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return { 1, maxReq - count - 1, now + window }
`

export class RedisRateLimiter implements RateLimiter {
  private readonly redis: RedisLikeClient
  private readonly config: RateLimitConfig
  private readonly now: () => number

  constructor(redis: RedisLikeClient, config: RateLimitConfig, now: () => number = Date.now) {
    this.redis = redis
    this.config = config
    this.now = now
  }

  async check(key: string): Promise<RateLimitResult> {
    const currentMs = this.now()
    const member = `${currentMs}-${randomUUID()}`
    const raw = (await this.redis.eval(
      SLIDING_WINDOW_LUA,
      1,
      key,
      currentMs,
      this.config.windowMs,
      this.config.maxRequests,
      member,
    )) as [number, number, number]
    const [allowed, remaining, resetAt] = raw

    if (allowed === 1) {
      return {
        allowed: true,
        remaining,
        resetAt: new Date(resetAt),
      }
    }
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(resetAt),
      retryAfterMs: Math.max(0, resetAt - currentMs),
    }
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key)
  }
}
