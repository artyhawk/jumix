import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Длина энтропии refresh-токена в байтах (CLAUDE.md §5.1: 64 байта base64url).
 * 64 байта = 512 бит, что достаточно для practical randomness.
 */
export const REFRESH_TOKEN_BYTES = 64

/**
 * Размер SHA-256 хэша в байтах. Соответствует BYTEA длине в БД.
 */
export const REFRESH_TOKEN_HASH_BYTES = 32

export type GeneratedRefreshToken = {
  /** Plain токен — возвращается клиенту, НЕ хранится в БД. */
  token: string
  /** SHA-256 хэш (raw bytes) — хранится в refresh_tokens.token_hash. */
  hash: Buffer
}

/**
 * Генерирует новый refresh-токен: case-urlsafe base64, ~86 символов.
 * Возвращает пару (plain, hash). Хранить — только hash.
 */
export function generateRefreshToken(): GeneratedRefreshToken {
  const bytes = randomBytes(REFRESH_TOKEN_BYTES)
  const token = bytes.toString('base64url')
  const hash = hashRefreshToken(token)
  return { token, hash }
}

/**
 * Детерминированный SHA-256 хэш plain-токена.
 */
export function hashRefreshToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

/**
 * Timing-safe сравнение plain-токена с ожидаемым хэшем.
 * Защищает от byte-level timing attack'ов при lookup по user_id.
 */
export function verifyRefreshToken(token: string, expectedHash: Buffer): boolean {
  const actual = hashRefreshToken(token)
  if (actual.length !== expectedHash.length) return false
  return timingSafeEqual(actual, expectedHash)
}
