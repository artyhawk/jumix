import { signAccessToken } from '@jumix/auth'
import { users } from '@jumix/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

let handle: TestAppHandle

beforeAll(async () => {
  handle = await buildTestApp()
}, 60_000)

afterAll(async () => {
  await handle.close()
})

describe('authenticate middleware (GET /auth/me)', () => {
  it('401 TOKEN_MISSING when no Authorization header and no cookie', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/auth/me' })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('TOKEN_MISSING')
  })

  it('401 TOKEN_MALFORMED for garbage Authorization header', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer not-a-real-jwt' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toMatch(/^TOKEN_(MALFORMED|INVALID)$/)
  })

  it('401 TOKEN_EXPIRED when exp in the past', async () => {
    const org = await createOrganization(handle.app)
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77001000001',
      organizationId: org.id,
    })
    const expired = await signAccessToken(
      {
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        tokenVersion: user.tokenVersion,
      },
      {
        ...handle.app.jwtConfig,
        now: () => Date.now() - (handle.app.jwtConfig.ttlSeconds + 60) * 1000,
      },
    )
    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${expired}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('TOKEN_EXPIRED')
  })

  it('200 and returns context for a valid owner token (via Authorization header)', async () => {
    const org = await createOrganization(handle.app, { bin: '100000000001' })
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77001000002',
      organizationId: org.id,
    })
    const token = await signTokenFor(handle.app, user)
    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      userId: user.id,
      organizationId: org.id,
      role: 'owner',
      tokenVersion: 0,
    })
  })

  it('200 and reads token from access_token cookie (mobile and web parity)', async () => {
    const org = await createOrganization(handle.app, { bin: '100000000002' })
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77001000003',
      organizationId: org.id,
    })
    const token = await signTokenFor(handle.app, user)
    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: `access_token=${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().userId).toBe(user.id)
  })

  it('200 for superadmin with null organizationId', async () => {
    const user = await createUser(handle.app, {
      role: 'superadmin',
      phone: '+77001000004',
      organizationId: null,
    })
    const token = await signTokenFor(handle.app, user)
    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      userId: user.id,
      organizationId: null,
      role: 'superadmin',
      tokenVersion: 0,
    })
  })

  it('401 TOKEN_VERSION_MISMATCH when logout-all incremented token_version in DB', async () => {
    const org = await createOrganization(handle.app, { bin: '100000000003' })
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77001000005',
      organizationId: org.id,
    })
    const token = await signTokenFor(handle.app, user) // tv=0 in claims

    // Simulate logout-all: bump tokenVersion in DB
    await handle.app.db.db.update(users).set({ tokenVersion: 1 }).where(eq(users.id, user.id))

    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('TOKEN_VERSION_MISMATCH')
  })

  it('401 USER_DELETED when user has deleted_at set', async () => {
    const org = await createOrganization(handle.app, { bin: '100000000004' })
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77001000006',
      organizationId: org.id,
    })
    const token = await signTokenFor(handle.app, user)

    await handle.app.db.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.id))

    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('USER_DELETED')
  })

  it('401 USER_BLOCKED when status=blocked', async () => {
    const org = await createOrganization(handle.app, { bin: '100000000005' })
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77001000007',
      organizationId: org.id,
    })
    const token = await signTokenFor(handle.app, user)

    await handle.app.db.db.update(users).set({ status: 'blocked' }).where(eq(users.id, user.id))

    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('USER_BLOCKED')
  })

  it('401 ORGANIZATION_INACTIVE when owner organization.status != active', async () => {
    const org = await createOrganization(handle.app, { bin: '100000000006', status: 'suspended' })
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77001000008',
      organizationId: org.id,
    })
    const token = await signTokenFor(handle.app, user)

    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('ORGANIZATION_INACTIVE')
  })

  it('superadmin is NOT blocked when some other organization is suspended', async () => {
    await createOrganization(handle.app, { bin: '100000000007', status: 'suspended' })
    const superadmin = await createUser(handle.app, {
      role: 'superadmin',
      phone: '+77001000009',
      organizationId: null,
    })
    const token = await signTokenFor(handle.app, superadmin)

    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('superadmin')
  })

  it('401 USER_NOT_FOUND when sub refers to non-existent user', async () => {
    const ghostToken = await signAccessToken(
      {
        userId: '00000000-0000-0000-0000-000000000000',
        organizationId: null,
        role: 'superadmin',
        tokenVersion: 0,
      },
      handle.app.jwtConfig,
    )
    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${ghostToken}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('USER_NOT_FOUND')
  })

  it('401 TOKEN_CLAIMS_INVALID when owner token has org=null (schema-level invariant)', async () => {
    // sign a bogus token with role=owner but org=null — claims schema should reject on verify
    const user = await createUser(handle.app, {
      role: 'superadmin',
      phone: '+77001000010',
      organizationId: null,
    })
    const badToken = await signAccessToken(
      {
        userId: user.id,
        organizationId: null,
        role: 'owner',
        tokenVersion: 0,
      },
      handle.app.jwtConfig,
    )
    const res = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${badToken}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('TOKEN_CLAIMS_INVALID')
  })
})
