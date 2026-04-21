import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, hashPassword, needsRehash, verifyPassword } from '../src'

describe('password hashing', () => {
  it('hash + verify: корректный пароль → true', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(await verifyPassword(hash, 'correct-horse-battery-staple')).toBe(true)
  })

  it('verify: неверный пароль → false', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(await verifyPassword(hash, 'wrong-password-000')).toBe(false)
  })

  it('verify: битый хэш → false (не бросает)', async () => {
    expect(await verifyPassword('not-a-hash', 'whatever-123')).toBe(false)
  })

  it(`hash: пароль короче ${MIN_PASSWORD_LENGTH} символов → AuthError`, async () => {
    await expect(hashPassword('short')).rejects.toMatchObject({
      code: 'PASSWORD_TOO_SHORT',
    })
  })

  it('needsRehash: свежий хэш с актуальными параметрами → false', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(await needsRehash(hash)).toBe(false)
  })

  it('needsRehash: мусор → true (безопасный default)', async () => {
    expect(await needsRehash('not-a-hash')).toBe(true)
  })
})
