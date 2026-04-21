import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SmsProvider } from '../src/integrations/mobizon/sms-provider'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser } from './helpers/fixtures'

/**
 * Test-provider перехватывает отправки чтобы тесты могли узнать код.
 * Подменяем через app.authServices после буста, потому что buildTestApp
 * собирает app с обычным DevStubSmsProvider.
 */
class CapturingSmsProvider implements SmsProvider {
  readonly name = 'capturing'
  readonly sent: Array<{ phone: string; text: string }> = []
  shouldFail = false
  async send(input: { phone: string; text: string }): Promise<void> {
    if (this.shouldFail) throw new Error('provider failure')
    this.sent.push(input)
  }
  lastCode(phone: string): string | null {
    const entry = [...this.sent].reverse().find((e) => e.phone === phone)
    if (!entry) return null
    const m = /(\d{6})/.exec(entry.text)
    return m?.[1] ?? null
  }
}

let handle: TestAppHandle
let provider: CapturingSmsProvider

beforeAll(async () => {
  handle = await buildTestApp()
  provider = new CapturingSmsProvider()
  // Hot-swap provider внутри уже собранного SMS-сервиса.
  // По сути — инверсия обычной DI: тест подменяет private поле через cast,
  // это единственное место в suite'е где мы трогаем внутренности.
  ;(handle.app.authServices.sms as unknown as { provider: SmsProvider }).provider = provider
}, 60_000)

afterAll(async () => {
  await handle.close()
})

describe('POST /auth/sms/request', () => {
  it('200 and sends a 6-digit code via provider', async () => {
    const phone = '+77010000001'
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/request',
      payload: { phone },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    const code = provider.lastCode(phone)
    expect(code).toMatch(/^\d{6}$/)
  })

  it('normalizes local-format phone ("87010000002") to +7...', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/request',
      payload: { phone: '87010000002' },
    })
    expect(res.statusCode).toBe(200)
    expect(provider.lastCode('+77010000002')).toMatch(/^\d{6}$/)
  })

  it('422 VALIDATION_ERROR for garbage phone', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/request',
      payload: { phone: 'not-a-phone' },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('429 RATE_LIMITED on second request within 60s cooldown', async () => {
    const phone = '+77010000003'
    const first = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/request',
      payload: { phone },
    })
    expect(first.statusCode).toBe(200)
    const second = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/request',
      payload: { phone },
    })
    expect(second.statusCode).toBe(429)
    expect(second.json().error.code).toBe('RATE_LIMITED')
    expect(second.json().error.details.reason).toBe('cooldown')
  })

  it('502 SMS_DELIVERY_FAILED when provider throws', async () => {
    provider.shouldFail = true
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/request',
      payload: { phone: '+77010000004' },
    })
    provider.shouldFail = false
    expect(res.statusCode).toBe(502)
    expect(res.json().error.code).toBe('SMS_DELIVERY_FAILED')
  })
})

describe('POST /auth/sms/verify', () => {
  it('400 SMS_CODE_INVALID_OR_EXPIRED when no code was requested', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/verify',
      payload: { phone: '+77020000001', code: '123456' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('SMS_CODE_INVALID_OR_EXPIRED')
  })

  it('400 when wrong code is supplied', async () => {
    const phone = '+77020000002'
    await handle.app.inject({ method: 'POST', url: '/auth/sms/request', payload: { phone } })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/verify',
      payload: { phone, code: '000000' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('SMS_CODE_INVALID_OR_EXPIRED')
  })

  it('403 USER_NOT_REGISTERED on correct code but no user in DB', async () => {
    const phone = '+77020000003'
    await handle.app.inject({ method: 'POST', url: '/auth/sms/request', payload: { phone } })
    const code = provider.lastCode(phone)
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/verify',
      payload: { phone, code },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('USER_NOT_REGISTERED')
  })

  it('200 and issues tokens when user exists', async () => {
    const org = await createOrganization(handle.app, { bin: '200000000001' })
    const phone = '+77020000004'
    const user = await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: org.id,
      name: 'Test Owner',
    })
    await handle.app.inject({ method: 'POST', url: '/auth/sms/request', payload: { phone } })
    const code = provider.lastCode(phone)
    const res = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/verify',
      payload: { phone, code, clientKind: 'web' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.accessToken).toEqual(expect.any(String))
    expect(body.refreshToken).toEqual(expect.any(String))
    expect(body.user.id).toBe(user.id)
    expect(body.user.role).toBe('owner')
    // refresh TTL web = 30 дней — проверяем порядок величины
    const ttlMs =
      new Date(body.refreshTokenExpiresAt).getTime() -
      new Date(body.accessTokenExpiresAt).getTime() +
      (handle.app.jwtConfig.ttlSeconds * 1000 - 0)
    expect(ttlMs).toBeGreaterThan(25 * 24 * 60 * 60 * 1000)
  })

  it('issued access token authenticates GET /auth/me', async () => {
    const org = await createOrganization(handle.app, { bin: '200000000002' })
    const phone = '+77020000005'
    const user = await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: org.id,
    })
    await handle.app.inject({ method: 'POST', url: '/auth/sms/request', payload: { phone } })
    const code = provider.lastCode(phone)
    const verify = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/verify',
      payload: { phone, code, clientKind: 'mobile' },
    })
    const { accessToken } = verify.json()
    const me = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().userId).toBe(user.id)
  })

  it('code is consumed — second verify with same code fails', async () => {
    const org = await createOrganization(handle.app, { bin: '200000000003' })
    const phone = '+77020000006'
    await createUser(handle.app, { role: 'owner', phone, organizationId: org.id })
    await handle.app.inject({ method: 'POST', url: '/auth/sms/request', payload: { phone } })
    const code = provider.lastCode(phone)
    const first = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/verify',
      payload: { phone, code },
    })
    expect(first.statusCode).toBe(200)
    const second = await handle.app.inject({
      method: 'POST',
      url: '/auth/sms/verify',
      payload: { phone, code },
    })
    expect(second.statusCode).toBe(400)
  })
})
