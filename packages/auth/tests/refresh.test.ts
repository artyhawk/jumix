import { describe, expect, it } from 'vitest'
import {
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_HASH_BYTES,
  generateRefreshToken,
  hashRefreshToken,
  verifyRefreshToken,
} from '../src'

describe('refresh token', () => {
  it('generate: token + hash имеют ожидаемые размеры', () => {
    const { token, hash } = generateRefreshToken()
    // base64url без padding: ceil(64 * 8 / 6) = 86 символов
    expect(token).toHaveLength(Math.ceil((REFRESH_TOKEN_BYTES * 8) / 6))
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(hash).toBeInstanceOf(Buffer)
    expect(hash.length).toBe(REFRESH_TOKEN_HASH_BYTES)
  })

  it('generate: каждый вызов выдаёт уникальный токен', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(generateRefreshToken().token)
    expect(seen.size).toBe(100)
  })

  it('hash: детерминированный', () => {
    const a = hashRefreshToken('sample-token')
    const b = hashRefreshToken('sample-token')
    expect(Buffer.compare(a, b)).toBe(0)
  })

  it('verify: корректный plain против хэша → true', () => {
    const { token, hash } = generateRefreshToken()
    expect(verifyRefreshToken(token, hash)).toBe(true)
  })

  it('verify: неверный plain → false', () => {
    const { hash } = generateRefreshToken()
    expect(verifyRefreshToken('wrong', hash)).toBe(false)
  })

  it('verify: хэш неверной длины → false (без бросания)', () => {
    expect(verifyRefreshToken('x', Buffer.alloc(16))).toBe(false)
  })
})
