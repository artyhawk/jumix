import { hashRefreshToken } from '@jumix/auth'
import { organizations, refreshTokens, users } from '@jumix/db'
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser } from './helpers/fixtures'

/**
 * Helper: выпустить пару tokens напрямую через TokenIssuerService, минуя
 * password/SMS flow. Даёт чистую «предысторию» для тестов refresh-rotation.
 */
async function issueTokens(
  handle: TestAppHandle,
  user: {
    id: string
    role: 'superadmin' | 'owner' | 'operator'
    organizationId: string | null
    tokenVersion: number
  },
  clientKind: 'web' | 'mobile' = 'web',
) {
  return handle.app.authServices.tokenIssuer.issue({
    user,
    clientKind,
    deviceId: null,
    ipAddress: '127.0.0.1',
    userAgent: 'test',
  })
}

let handle: TestAppHandle
let orgId: string

beforeAll(async () => {
  handle = await buildTestApp()
  const org = await createOrganization(handle.app, { bin: '400000000001' })
  orgId = org.id
}, 60_000)

afterAll(async () => {
  await handle.close()
})

describe('POST /auth/refresh', () => {
  it('200 rotation: issues new pair, marks old revoked=rotation with replaced_by', async () => {
    const phone = '+77060000001'
    const user = await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
    })
    const oldTokens = await issueTokens(handle, user)

    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: oldTokens.refreshToken, clientKind: 'web' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.accessToken).toEqual(expect.any(String))
    expect(body.refreshToken).toEqual(expect.any(String))
    expect(body.refreshToken).not.toBe(oldTokens.refreshToken)

    const oldHash = hashRefreshToken(oldTokens.refreshToken)
    const [old] = await handle.app.db.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, oldHash))
    if (!old) throw new Error('old token vanished')
    expect(old.revokedAt).toBeInstanceOf(Date)
    expect(old.revokedReason).toBe('rotation')
    expect(old.replacedBy).not.toBeNull()
  })

  it('new refresh token after rotation is usable, old one is rejected', async () => {
    const phone = '+77060000002'
    const user = await createUser(handle.app, { role: 'owner', phone, organizationId: orgId })
    const first = await issueTokens(handle, user)

    const rotated = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    })
    expect(rotated.statusCode).toBe(200)
    const { refreshToken: secondRefresh } = rotated.json()

    // Новый токен работает
    const third = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: secondRefresh },
    })
    expect(third.statusCode).toBe(200)
  })

  it('401 INVALID_REFRESH on unknown token', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'A'.repeat(86) },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('INVALID_REFRESH')
  })

  it('401 INVALID_REFRESH on expired token', async () => {
    const phone = '+77060000003'
    const user = await createUser(handle.app, { role: 'owner', phone, organizationId: orgId })
    const tokens = await issueTokens(handle, user)
    // Форсим expired: обновляем expires_at в прошлое
    await handle.app.db.db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokens.id, tokens.refreshTokenId))

    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('INVALID_REFRESH')
  })

  it('REUSE DETECTION: re-using rotated token revokes entire chain + bumps tokenVersion', async () => {
    const phone = '+77060000004'
    const user = await createUser(handle.app, { role: 'owner', phone, organizationId: orgId })
    const gen1 = await issueTokens(handle, user)

    // Легитимная ротация: gen1 → gen2
    const r1 = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: gen1.refreshToken },
    })
    const gen2Refresh = r1.json().refreshToken as string

    // Ещё одна ротация: gen2 → gen3
    const r2 = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: gen2Refresh },
    })
    const gen3Refresh = r2.json().refreshToken as string

    // Атакующий предъявляет gen1 (уже revoked=rotation)
    const reuse = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: gen1.refreshToken },
    })
    expect(reuse.statusCode).toBe(401)
    expect(reuse.json().error.code).toBe('INVALID_REFRESH')

    // Вся цепочка gen1 → gen2 → gen3 помечена reuse_detected
    const allTokens = await handle.app.db.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, user.id))
    for (const t of allTokens) {
      expect(t.revokedAt).not.toBeNull()
    }
    expect(allTokens.some((t) => t.revokedReason === 'reuse_detected')).toBe(true)

    // gen3 теперь тоже не работает
    const afterReuse = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: gen3Refresh },
    })
    expect(afterReuse.statusCode).toBe(401)

    // tokenVersion bumped
    const [fresh] = await handle.app.db.db.select().from(users).where(eq(users.id, user.id))
    if (!fresh) throw new Error('user vanished')
    expect(fresh.tokenVersion).toBeGreaterThan(user.tokenVersion)
  })

  it('401 INVALID_REFRESH when user is soft-deleted', async () => {
    const phone = '+77060000005'
    const user = await createUser(handle.app, { role: 'owner', phone, organizationId: orgId })
    const tokens = await issueTokens(handle, user)
    await handle.app.db.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.id))

    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('INVALID_REFRESH')
  })

  it('401 INVALID_REFRESH when organization is suspended (non-superadmin)', async () => {
    // Отдельный org которую можно suspend'нуть — без влияния на другие тесты
    const localOrg = await createOrganization(handle.app, { bin: '400000000099' })
    const phone = '+77060000006'
    const user = await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: localOrg.id,
    })
    const tokens = await issueTokens(handle, user)

    await handle.app.db.db
      .update(organizations)
      .set({ status: 'suspended' })
      .where(eq(organizations.id, localOrg.id))

    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('INVALID_REFRESH')
  })

  it('200 for superadmin even though they have no organization', async () => {
    const phone = '+77060000007'
    const user = await createUser(handle.app, {
      role: 'superadmin',
      phone,
      organizationId: null,
    })
    const tokens = await issueTokens(handle, user, 'mobile')

    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken, clientKind: 'mobile' },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('POST /auth/logout', () => {
  it('200 and marks refresh revoked=logout', async () => {
    const phone = '+77070000001'
    const user = await createUser(handle.app, { role: 'owner', phone, organizationId: orgId })
    const tokens = await issueTokens(handle, user)

    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: tokens.refreshToken },
    })
    expect(res.statusCode).toBe(200)

    const [row] = await handle.app.db.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, tokens.refreshTokenId))
    if (!row) throw new Error('missing')
    expect(row.revokedAt).toBeInstanceOf(Date)
    expect(row.revokedReason).toBe('logout')
  })

  it('200 (idempotent) on unknown token', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: 'Z'.repeat(86) },
    })
    expect(res.statusCode).toBe(200)
  })

  it('200 (idempotent) on already-revoked token — reason unchanged', async () => {
    const phone = '+77070000002'
    const user = await createUser(handle.app, { role: 'owner', phone, organizationId: orgId })
    const tokens = await issueTokens(handle, user)

    const first = await handle.app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: tokens.refreshToken },
    })
    expect(first.statusCode).toBe(200)
    const second = await handle.app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: tokens.refreshToken },
    })
    expect(second.statusCode).toBe(200)

    const [row] = await handle.app.db.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, tokens.refreshTokenId))
    expect(row?.revokedReason).toBe('logout')
  })

  it('logout does NOT bump tokenVersion', async () => {
    const phone = '+77070000003'
    const user = await createUser(handle.app, { role: 'owner', phone, organizationId: orgId })
    const tokens = await issueTokens(handle, user)

    await handle.app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: tokens.refreshToken },
    })

    const [fresh] = await handle.app.db.db.select().from(users).where(eq(users.id, user.id))
    expect(fresh?.tokenVersion).toBe(user.tokenVersion)
  })
})

describe('POST /auth/logout-all', () => {
  it('401 without authentication', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      payload: {},
    })
    expect(res.statusCode).toBe(401)
  })

  it('200 revokes ALL active refreshes + bumps tokenVersion + invalidates access', async () => {
    const phone = '+77080000001'
    const user = await createUser(handle.app, { role: 'owner', phone, organizationId: orgId })
    // Два устройства: web + mobile
    const webTokens = await issueTokens(handle, user, 'web')
    const mobileTokens = await issueTokens(handle, user, 'mobile')

    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      payload: {},
      headers: { authorization: `Bearer ${webTokens.accessToken}` },
    })
    expect(res.statusCode).toBe(200)

    // Все refresh для user'а revoked
    const active = await handle.app.db.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)))
    expect(active.length).toBe(0)

    // tokenVersion bumped
    const [fresh] = await handle.app.db.db.select().from(users).where(eq(users.id, user.id))
    expect(fresh?.tokenVersion).toBeGreaterThan(user.tokenVersion)

    // Обе access токена теперь не проходят /auth/me
    const meWeb = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${webTokens.accessToken}` },
    })
    expect(meWeb.statusCode).toBe(401)
    expect(meWeb.json().error.code).toBe('TOKEN_VERSION_MISMATCH')

    const meMobile = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${mobileTokens.accessToken}` },
    })
    expect(meMobile.statusCode).toBe(401)

    // Mobile refresh тоже мёртвый
    const mobileRefresh = await handle.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: mobileTokens.refreshToken },
    })
    expect(mobileRefresh.statusCode).toBe(401)
  })
})
