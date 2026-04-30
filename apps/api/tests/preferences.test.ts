import { hashPassword } from '@jumix/auth'
import { users } from '@jumix/db'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * B3-THEME — user theme preference (PATCH /me/preferences) +
 * `themeMode` в login DTO. Default 'system' для new users (migration 0014).
 */

const PASSWORD = 'test-password-12345'
let passwordHash: string
let handle: TestAppHandle
let orgId: string

beforeAll(async () => {
  handle = await buildTestApp()
  passwordHash = await hashPassword(PASSWORD)
  const org = await createOrganization(handle.app, { bin: '500000000001' })
  orgId = org.id
}, 60_000)

afterAll(async () => {
  await handle.close()
})

describe('user theme preference (B3-THEME)', () => {
  it("new user has theme_mode = 'system' by default (migration 0014)", async () => {
    const phone = '+77051000001'
    const user = await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      passwordHash,
    })
    const rows = await handle.app.db.db
      .select({ themeMode: users.themeMode })
      .from(users)
      .where(eq(users.id, user.id))
    expect(rows[0]?.themeMode).toBe('system')
  })

  it("POST /auth/login returns user.themeMode='system' for fresh user", async () => {
    const phone = '+77051000002'
    await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      passwordHash,
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: PASSWORD, clientKind: 'web' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().user.themeMode).toBe('system')
  })

  it('PATCH /me/preferences updates themeMode to "light"', async () => {
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77051000003',
      organizationId: orgId,
      passwordHash,
    })
    const token = await signTokenFor(handle.app, user)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      headers: { authorization: `Bearer ${token}` },
      payload: { themeMode: 'light' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().user.themeMode).toBe('light')
    expect(res.json().user.id).toBe(user.id)

    const rows = await handle.app.db.db
      .select({ themeMode: users.themeMode })
      .from(users)
      .where(eq(users.id, user.id))
    expect(rows[0]?.themeMode).toBe('light')
  })

  it('PATCH /me/preferences updates themeMode to "dark"', async () => {
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77051000004',
      organizationId: orgId,
      passwordHash,
    })
    const token = await signTokenFor(handle.app, user)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      headers: { authorization: `Bearer ${token}` },
      payload: { themeMode: 'dark' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().user.themeMode).toBe('dark')
  })

  it('PATCH /me/preferences accepts "system" (revert to OS default)', async () => {
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77051000005',
      organizationId: orgId,
      passwordHash,
    })
    const token = await signTokenFor(handle.app, user)
    // Сначала переключаем в light, потом обратно в system.
    await handle.app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      headers: { authorization: `Bearer ${token}` },
      payload: { themeMode: 'light' },
    })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      headers: { authorization: `Bearer ${token}` },
      payload: { themeMode: 'system' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().user.themeMode).toBe('system')
  })

  it('PATCH /me/preferences rejects invalid themeMode (zod enum)', async () => {
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77051000006',
      organizationId: orgId,
      passwordHash,
    })
    const token = await signTokenFor(handle.app, user)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      headers: { authorization: `Bearer ${token}` },
      payload: { themeMode: 'midnight' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('PATCH /me/preferences rejects missing themeMode field', async () => {
    const user = await createUser(handle.app, {
      role: 'owner',
      phone: '+77051000007',
      organizationId: orgId,
      passwordHash,
    })
    const token = await signTokenFor(handle.app, user)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })

  it('PATCH /me/preferences requires authentication (401)', async () => {
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      payload: { themeMode: 'light' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('next login returns updated themeMode after PATCH', async () => {
    const phone = '+77051000008'
    const user = await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      passwordHash,
    })
    const token = await signTokenFor(handle.app, user)
    await handle.app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      headers: { authorization: `Bearer ${token}` },
      payload: { themeMode: 'dark' },
    })

    const login = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: PASSWORD, clientKind: 'web' },
    })
    expect(login.statusCode).toBe(200)
    expect(login.json().user.themeMode).toBe('dark')
  })

  it('DB CHECK constraint rejects invalid theme_mode (migration 0014 invariant)', async () => {
    // Защищает миграцию: даже если application-валидация обойдена,
    // БД не пропустит мусор в колонку.
    const update = handle.app.db.db.execute(sql`
      UPDATE users SET theme_mode = 'sepia' WHERE phone = '+77051000001'
    `)
    await expect(update).rejects.toThrow()
  })
})
