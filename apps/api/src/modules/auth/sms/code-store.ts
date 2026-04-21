import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import type { RedisLikeClient } from '@jumix/auth'

export type StoredCode = {
  codeHash: string
  expiresAt: number
  attempts: number
}

export interface SmsCodeStore {
  /**
   * Записать (или перезаписать) код для phone. Используется при запросе нового
   * кода — старый просто перетирается, предыдущий attempts сбрасывается на 0.
   */
  put(phone: string, code: string, ttlSeconds: number): Promise<void>
  /** Вернуть запись если существует и не истекла, иначе null. */
  get(phone: string): Promise<StoredCode | null>
  /** Инкрементировать счётчик ошибок при ошибочном вводе кода. */
  incrementAttempts(phone: string): Promise<number>
  /** Удалить запись (после успешной верификации или exhaust). */
  delete(phone: string): Promise<void>
}

/**
 * SHA-256 от `phone|code`. phone в канонической форме `+7...`, чтобы не
 * зависеть от регистра/пробелов. code — 6 digits.
 */
export function hashSmsCode(phone: string, code: string): string {
  return createHash('sha256').update(`${phone}|${code}`).digest('hex')
}

export function generateSmsCode(): string {
  // crypto.randomInt — криптостойкий RNG; 6 цифр с leading zeros.
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

/**
 * constant-time сравнение hex-строк длины 64 (SHA-256). Защищает от
 * timing-атак при верификации кода.
 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export class MemorySmsCodeStore implements SmsCodeStore {
  private readonly map = new Map<string, StoredCode>()

  async put(phone: string, code: string, ttlSeconds: number): Promise<void> {
    this.map.set(phone, {
      codeHash: hashSmsCode(phone, code),
      expiresAt: Date.now() + ttlSeconds * 1000,
      attempts: 0,
    })
  }

  async get(phone: string): Promise<StoredCode | null> {
    const entry = this.map.get(phone)
    if (!entry) return null
    if (entry.expiresAt < Date.now()) {
      this.map.delete(phone)
      return null
    }
    return entry
  }

  async incrementAttempts(phone: string): Promise<number> {
    const entry = this.map.get(phone)
    if (!entry) return 0
    entry.attempts += 1
    return entry.attempts
  }

  async delete(phone: string): Promise<void> {
    this.map.delete(phone)
  }
}

/**
 * Redis-бэкенд. Ключ `auth:sms:code:{phone}` хранит JSON. TTL = Redis EXPIRE.
 * attempts инкрементируется через HINCRBY на отдельном hash-ключе
 * `auth:sms:attempts:{phone}` с тем же TTL.
 *
 * Для prod — обязательный: MemorySmsCodeStore не переживает рестарт и не
 * работает в multi-instance deploy'е.
 */
export class RedisSmsCodeStore implements SmsCodeStore {
  private readonly codePrefix = 'auth:sms:code:'
  private readonly attemptsPrefix = 'auth:sms:attempts:'

  constructor(private readonly redis: RedisLikeClient) {}

  async put(phone: string, code: string, ttlSeconds: number): Promise<void> {
    const key = this.codePrefix + phone
    const attemptsKey = this.attemptsPrefix + phone
    // сохраняем как JSON: не нужен hash для такой малой структуры
    const payload = JSON.stringify({
      codeHash: hashSmsCode(phone, code),
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
    // Redis client без готовых set-ex биндингов в RedisLikeClient — используем eval
    await this.redis.eval(
      'redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3]); redis.call("DEL", KEYS[2]); return 1',
      2,
      key,
      attemptsKey,
      payload,
      String(ttlSeconds),
    )
  }

  async get(phone: string): Promise<StoredCode | null> {
    const key = this.codePrefix + phone
    const raw = (await this.redis.eval('return redis.call("GET", KEYS[1])', 1, key)) as
      | string
      | null
    if (!raw) return null
    const { codeHash, expiresAt } = JSON.parse(raw) as { codeHash: string; expiresAt: number }
    if (expiresAt < Date.now()) return null
    const attemptsRaw = (await this.redis.eval(
      'return redis.call("GET", KEYS[1])',
      1,
      this.attemptsPrefix + phone,
    )) as string | null
    const attempts = attemptsRaw ? Number(attemptsRaw) : 0
    return { codeHash, expiresAt, attempts }
  }

  async incrementAttempts(phone: string): Promise<number> {
    const attemptsKey = this.attemptsPrefix + phone
    const codeKey = this.codePrefix + phone
    const next = (await this.redis.eval(
      // Привязываем TTL attempts к TTL кода — не переживаем «узнать pin после expiry».
      `local n = redis.call('INCR', KEYS[1])
       local ttl = redis.call('TTL', KEYS[2])
       if ttl and ttl > 0 then redis.call('EXPIRE', KEYS[1], ttl) end
       return n`,
      2,
      attemptsKey,
      codeKey,
    )) as number
    return next
  }

  async delete(phone: string): Promise<void> {
    await this.redis.eval(
      'redis.call("DEL", KEYS[1]); redis.call("DEL", KEYS[2]); return 1',
      2,
      this.codePrefix + phone,
      this.attemptsPrefix + phone,
    )
  }
}
