import { hashPassword } from '@jumix/auth'
import { authEvents, refreshTokens, users } from '@jumix/db'
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SmsProvider } from '../src/integrations/mobizon/sms-provider'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser } from './helpers/fixtures'

/**
 * Capturing provider — тот же pattern что в sms-auth.test.ts. Реусаем здесь
 * для reset-flow (reset SMS идёт через тот же SmsProvider).
 */
class CapturingSmsProvider implements SmsProvider {
  readonly name = 'capturing'
  readonly sent: Array<{ phone: string; text: string }> = []
  async send(input: { phone: string; text: string }): Promise<void> {
    this.sent.push(input)
  }
  lastCode(phone: string): string | null {
    const entry = [...this.sent].reverse().find((e) => e.phone === phone)
    if (!entry) return null
    const m = /(\d{6})/.exec(entry.text)
    return m?.[1] ?? null
  }
}

const PASSWORD = 'test-password-12345'
let passwordHash: string

let handle: TestAppHandle
let provider: CapturingSmsProvider
let orgId: string

beforeAll(async () => {
  handle = await buildTestApp()
  provider = new CapturingSmsProvider()
  ;(handle.app.authServices.sms as unknown as { provider: SmsProvider }).provider = provider
  ;(handle.app.authServices.password as unknown as { smsProvider: SmsProvider }).smsProvider =
    provider

  passwordHash = await hashPassword(PASSWORD)
  const org = await createOrganization(handle.app, { bin: '300000000001' })
  orgId = org.id
}, 60_000)

afterAll(async () => {
  await handle.close()
})

describe('POST /auth/login', () => {
  it('200 and issues tokens on correct credentials', async () => {
    const phone = '+77030000001'
    const user = await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      passwordHash,
      name: 'Password Owner',
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: PASSWORD, clientKind: 'web' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.accessToken).toEqual(expect.any(String))
    expect(body.refreshToken).toEqual(expect.any(String))
    expect(body.user.id).toBe(user.id)
    expect(body.user.role).toBe('owner')
  })

  it('issued access token authenticates GET /auth/me', async () => {
    const phone = '+77030000002'
    const user = await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      passwordHash,
    })
    const login = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: PASSWORD, clientKind: 'mobile' },
    })
    const { accessToken } = login.json()
    const me = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().userId).toBe(user.id)
  })

  it('401 INVALID_CREDENTIALS on wrong password', async () => {
    const phone = '+77030000003'
    await createUser(handle.app, { role: 'owner', phone, organizationId: orgId, passwordHash })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: 'wrong-password-1' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('401 INVALID_CREDENTIALS when phone does not exist (no enumeration)', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone: '+77030009999', password: PASSWORD },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('401 INVALID_CREDENTIALS when user has no password set', async () => {
    const phone = '+77030000004'
    await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      // passwordHash explicitly omitted → nullable column stays null
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: PASSWORD },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('401 INVALID_CREDENTIALS when user is blocked', async () => {
    const phone = '+77030000005'
    await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      passwordHash,
      status: 'blocked',
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: PASSWORD },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('401 INVALID_CREDENTIALS when user is soft-deleted', async () => {
    const phone = '+77030000006'
    await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      passwordHash,
      deletedAt: new Date(),
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: PASSWORD },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('429 ACCOUNT_LOCKED after 10 login_failure events in window', async () => {
    const phone = '+77030000007'
    const user = await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      passwordHash,
    })
    // Имитируем 10 ранее зафиксированных failures — без argon2 hashing
    // (иначе тест бежит секунду на каждом verify).
    await handle.app.db.db.insert(authEvents).values(
      Array.from({ length: 10 }, () => ({
        userId: user.id,
        eventType: 'login_failure' as const,
        phone,
        ipAddress: '127.0.0.1',
        userAgent: null,
        success: false,
        failureReason: 'wrong_password',
        metadata: {},
      })),
    )
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: PASSWORD },
    })
    expect(res.statusCode).toBe(429)
    expect(res.json().error.code).toBe('ACCOUNT_LOCKED')
    expect(res.json().error.details.retryAfterSeconds).toBeGreaterThan(0)
  })
})

describe('POST /auth/password-reset/request', () => {
  it('200 and sends SMS with 6-digit code when user exists', async () => {
    const phone = '+77040000001'
    await createUser(handle.app, { role: 'owner', phone, organizationId: orgId, passwordHash })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { phone },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    expect(provider.lastCode(phone)).toMatch(/^\d{6}$/)
  })

  it('200 when user does not exist (no enumeration, no SMS)', async () => {
    const phone = '+77049999999'
    const before = provider.sent.length
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { phone },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    // SMS provider не дёрнут
    expect(provider.sent.slice(before).find((s) => s.phone === phone)).toBeUndefined()
  })

  it('200 when user is blocked (no SMS sent)', async () => {
    const phone = '+77040000002'
    await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      passwordHash,
      status: 'blocked',
    })
    const before = provider.sent.length
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { phone },
    })
    expect(res.statusCode).toBe(200)
    expect(provider.sent.slice(before).find((s) => s.phone === phone)).toBeUndefined()
  })

  it('429 RATE_LIMITED on second request within 60s cooldown', async () => {
    const phone = '+77040000003'
    await createUser(handle.app, { role: 'owner', phone, organizationId: orgId, passwordHash })
    const first = await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { phone },
    })
    expect(first.statusCode).toBe(200)
    const second = await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { phone },
    })
    expect(second.statusCode).toBe(429)
    expect(second.json().error.code).toBe('RATE_LIMITED')
  })
})

describe('POST /auth/password-reset/confirm', () => {
  it('422 VALIDATION_ERROR when newPassword is shorter than MIN_PASSWORD_LENGTH', async () => {
    const phone = '+77050000001'
    await createUser(handle.app, { role: 'owner', phone, organizationId: orgId, passwordHash })
    await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { phone },
    })
    const code = provider.lastCode(phone) ?? '000000'
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      payload: { phone, code, newPassword: 'short' },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('400 PASSWORD_RESET_INVALID on wrong code', async () => {
    const phone = '+77050000002'
    await createUser(handle.app, { role: 'owner', phone, organizationId: orgId, passwordHash })
    await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { phone },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      payload: { phone, code: '000000', newPassword: 'new-password-67890' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('PASSWORD_RESET_INVALID')
  })

  it('400 PASSWORD_RESET_INVALID when confirm called without prior request', async () => {
    const phone = '+77050000003'
    await createUser(handle.app, { role: 'owner', phone, organizationId: orgId, passwordHash })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      payload: { phone, code: '123456', newPassword: 'new-password-67890' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('PASSWORD_RESET_INVALID')
  })

  it('200 on success: new password works, old refresh revoked, tokenVersion bumped', async () => {
    const phone = '+77050000004'
    const user = await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      passwordHash,
    })
    // Залогинились старым паролем → получили refresh
    const oldLogin = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: PASSWORD },
    })
    expect(oldLogin.statusCode).toBe(200)

    // Запросили reset и получили код
    await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { phone },
    })
    const code = provider.lastCode(phone)
    expect(code).toMatch(/^\d{6}$/)
    if (!code) throw new Error('no reset code')

    const NEW_PASSWORD = 'brand-new-password-99'
    const confirm = await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      payload: { phone, code, newPassword: NEW_PASSWORD },
    })
    expect(confirm.statusCode).toBe(200)

    // Старый пароль больше не работает
    const loginOld = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: PASSWORD },
    })
    expect(loginOld.statusCode).toBe(401)

    // Новый работает
    const loginNew = await handle.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password: NEW_PASSWORD },
    })
    expect(loginNew.statusCode).toBe(200)

    // Все refresh-токены до reset — revoked
    const activeRefresh = await handle.app.db.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)))
    // После reset был успешный повторный login (выписал новый refresh),
    // значит среди активных должен быть ровно один — свежий.
    expect(activeRefresh.length).toBe(1)

    // tokenVersion bumped
    const [fresh] = await handle.app.db.db.select().from(users).where(eq(users.id, user.id))
    if (!fresh) throw new Error('user vanished')
    expect(fresh.tokenVersion).toBeGreaterThanOrEqual(1)
  })

  it('400 PASSWORD_RESET_INVALID when same code is reused', async () => {
    const phone = '+77050000005'
    await createUser(handle.app, { role: 'owner', phone, organizationId: orgId, passwordHash })
    await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { phone },
    })
    const code = provider.lastCode(phone)
    if (!code) throw new Error('no reset code')
    const first = await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      payload: { phone, code, newPassword: 'first-new-password-1' },
    })
    expect(first.statusCode).toBe(200)
    const second = await handle.app.inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      payload: { phone, code, newPassword: 'second-new-password-2' },
    })
    expect(second.statusCode).toBe(400)
    expect(second.json().error.code).toBe('PASSWORD_RESET_INVALID')
  })
})
