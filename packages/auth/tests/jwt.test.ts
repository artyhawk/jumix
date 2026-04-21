import { randomUUID } from 'node:crypto'
import { type KeyLike, exportPKCS8, exportSPKI, generateKeyPair } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  type AccessTokenConfig,
  AuthError,
  JWT_ALG,
  loadSigningKey,
  loadVerificationKey,
  signAccessToken,
  verifyAccessToken,
} from '../src'

let signingKey: KeyLike
let verificationKey: KeyLike
let otherVerificationKey: KeyLike

beforeAll(async () => {
  const kp = await generateKeyPair(JWT_ALG)
  signingKey = await loadSigningKey(await exportPKCS8(kp.privateKey))
  verificationKey = await loadVerificationKey(await exportSPKI(kp.publicKey))
  const other = await generateKeyPair(JWT_ALG)
  otherVerificationKey = await loadVerificationKey(await exportSPKI(other.publicKey))
})

function cfg(overrides: Partial<AccessTokenConfig> = {}): AccessTokenConfig {
  return {
    signingKey,
    verificationKey,
    ttlSeconds: 900,
    issuer: 'jumix',
    audience: 'jumix-api',
    ...overrides,
  }
}

describe('JWT access token', () => {
  it('round-trip: sign → verify возвращает claims', async () => {
    const userId = randomUUID()
    const orgId = randomUUID()
    const token = await signAccessToken(
      { userId, organizationId: orgId, role: 'owner', tokenVersion: 3 },
      cfg(),
    )
    const claims = await verifyAccessToken(token, cfg())
    expect(claims.sub).toBe(userId)
    expect(claims.org).toBe(orgId)
    expect(claims.role).toBe('owner')
    expect(claims.tv).toBe(3)
    expect(claims.iss).toBe('jumix')
    expect(claims.aud).toBe('jumix-api')
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/)
    expect(claims.exp - claims.iat).toBe(900)
  })

  it('superadmin с org=null валиден', async () => {
    const token = await signAccessToken(
      { userId: randomUUID(), organizationId: null, role: 'superadmin', tokenVersion: 0 },
      cfg(),
    )
    const claims = await verifyAccessToken(token, cfg())
    expect(claims.role).toBe('superadmin')
    expect(claims.org).toBeNull()
  })

  it('owner без org отклоняется (invariant)', async () => {
    // TS-тип signAccessToken не ловит такой invariant — нужен runtime guard
    const token = await signAccessToken(
      {
        userId: randomUUID(),
        organizationId: null as unknown as string,
        role: 'owner',
        tokenVersion: 0,
      },
      cfg(),
    )
    await expect(verifyAccessToken(token, cfg())).rejects.toMatchObject({
      code: 'TOKEN_CLAIMS_INVALID',
    })
  })

  it('superadmin с заданной org отклоняется (invariant)', async () => {
    const token = await signAccessToken(
      {
        userId: randomUUID(),
        organizationId: randomUUID() as unknown as null,
        role: 'superadmin',
        tokenVersion: 0,
      },
      cfg(),
    )
    await expect(verifyAccessToken(token, cfg())).rejects.toMatchObject({
      code: 'TOKEN_CLAIMS_INVALID',
    })
  })

  it('operator без org отклоняется (invariant)', async () => {
    const token = await signAccessToken(
      {
        userId: randomUUID(),
        organizationId: null as unknown as string,
        role: 'operator',
        tokenVersion: 0,
      },
      cfg(),
    )
    await expect(verifyAccessToken(token, cfg())).rejects.toMatchObject({
      code: 'TOKEN_CLAIMS_INVALID',
    })
  })

  it('истёкший токен → TOKEN_EXPIRED', async () => {
    const fixed = 1_700_000_000_000
    const frozen = cfg({ now: () => fixed, ttlSeconds: 60 })
    const token = await signAccessToken(
      { userId: randomUUID(), organizationId: randomUUID(), role: 'owner', tokenVersion: 0 },
      frozen,
    )
    const later = cfg({ now: () => fixed + 120_000 })
    await expect(verifyAccessToken(token, later)).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    })
  })

  it('неверный issuer → TOKEN_WRONG_ISSUER', async () => {
    const token = await signAccessToken(
      { userId: randomUUID(), organizationId: randomUUID(), role: 'owner', tokenVersion: 0 },
      cfg({ issuer: 'evil' }),
    )
    await expect(verifyAccessToken(token, cfg({ issuer: 'jumix' }))).rejects.toMatchObject({
      code: 'TOKEN_WRONG_ISSUER',
    })
  })

  it('неверная audience → TOKEN_WRONG_AUDIENCE', async () => {
    const token = await signAccessToken(
      { userId: randomUUID(), organizationId: randomUUID(), role: 'owner', tokenVersion: 0 },
      cfg({ audience: 'other-api' }),
    )
    await expect(verifyAccessToken(token, cfg())).rejects.toMatchObject({
      code: 'TOKEN_WRONG_AUDIENCE',
    })
  })

  it('подпись чужим ключом → TOKEN_INVALID', async () => {
    const token = await signAccessToken(
      { userId: randomUUID(), organizationId: randomUUID(), role: 'owner', tokenVersion: 0 },
      cfg(),
    )
    await expect(
      verifyAccessToken(token, cfg({ verificationKey: otherVerificationKey })),
    ).rejects.toMatchObject({ code: 'TOKEN_INVALID' })
  })

  it('мусор вместо токена → TOKEN_MALFORMED', async () => {
    await expect(verifyAccessToken('not.a.jwt', cfg())).rejects.toBeInstanceOf(AuthError)
  })

  it('loadSigningKey бросает AuthError на невалидном PEM', async () => {
    await expect(
      loadSigningKey('-----BEGIN GARBAGE-----\nxxx\n-----END GARBAGE-----'),
    ).rejects.toMatchObject({
      code: 'KEY_INVALID',
    })
  })
})
