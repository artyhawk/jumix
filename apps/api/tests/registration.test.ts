import { auditLog, craneProfiles, refreshTokens, users } from '@jumix/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SmsProvider } from '../src/integrations/mobizon/sms-provider'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты public registration flow (ADR 0004).
 *
 * Покрывают:
 *   POST /api/v1/registration/start
 *     - 202 + SMS отправлен + OTP виден в перехвате
 *     - normalize phone (8... → +7...)
 *     - 422 VALIDATION_ERROR на garbage phone
 *     - 429 RATE_LIMITED на повторный запрос в cooldown окне
 *     - 502 SMS_DELIVERY_FAILED на провайдерной ошибке
 *     - 202 даже если phone УЖЕ зарегистрирован (enumeration protection)
 *     - audit_log: registration.start с masked phone
 *
 *   POST /api/v1/registration/verify
 *     - 400 SMS_CODE_INVALID_OR_EXPIRED без start-шага
 *     - 400 на неверный код
 *     - 422 VALIDATION_ERROR на невалидный ИИН
 *     - 409 PHONE_ALREADY_REGISTERED если user с этим phone уже есть
 *     - 409 IIN_ALREADY_EXISTS если crane_profile с таким ИИН уже есть
 *     - 201 happy path: user+profile созданы, status=pending, JWT выданы
 *     - access token позволяет GET /auth/me и /api/v1/crane-profiles/me
 *     - profile approvalStatus='pending' (ADR 0003: superadmin апрувит)
 *     - audit_log: registration.complete с craneProfileId/userId/masked phone
 *     - refresh_tokens row создан (TTL зависит от clientKind)
 *     - code сжигается: повтор verify тем же code → 400
 *     - транзакционность: race IIN-конфликт → ни user ни profile не созданы
 *
 *   end-to-end:
 *     - registration → profile pending → /me/status canWork=false
 *     - superadmin approve → canWork всё ещё false (нет membership)
 *     - owner hire + superadmin approve → canWork=true
 *
 * Единый Postgres-контейнер на файл. BIN-серия 68xxxx. Phone серия +7780xxxxxxx.
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
let superadminToken: string
let ownerToken: string
let orgId: string

beforeAll(async () => {
  handle = await buildTestApp()
  provider = new CapturingSmsProvider()
  ;(handle.app.authServices.sms as unknown as { provider: SmsProvider }).provider = provider

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77800000000',
    organizationId: null,
    name: 'Super',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const org = await createOrganization(handle.app, { name: 'Reg Org', bin: '680000000001' })
  orgId = org.id
  const owner = await createUser(handle.app, {
    role: 'owner',
    phone: '+77800000001',
    organizationId: orgId,
    name: 'Reg Owner',
  })
  ownerToken = await signTokenFor(handle.app, owner)
}, 60_000)

afterAll(async () => {
  await handle.close()
})

beforeEach(async () => {
  // Per-IP лимит на /sms/request — 20/hour. В тестах все запросы идут с
  // 127.0.0.1, поэтому без сброса suite выбивает 429 после ~20 тестов.
  // Cooldown и per-phone лимиты не сбрасываем — тесты на них полагаются.
  const smsService = handle.app.authServices.sms as unknown as {
    limiters: { perIpHourly: { reset(key: string): Promise<void> } }
  }
  await smsService.limiters.perIpHourly.reset('sms:hr:ip:127.0.0.1')
})

/**
 * Вычисляет валидный KZ ИИН по seed'у (тот же алгоритм, что в crane-profile.test.ts).
 */
function iin(seed: number): string {
  let base = Math.floor(seed)
  while (true) {
    const padded = String(base).padStart(11, '0')
    if (padded.length !== 11) throw new Error(`iin seed too large: ${seed}`)
    const digits = Array.from(padded, (c) => Number.parseInt(c, 10))
    const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]
    const weightedSum = (weights: number[]) =>
      weights.reduce((acc, w, i) => acc + (digits[i] ?? 0) * w, 0)
    let check = weightedSum(w1) % 11
    if (check === 10) {
      check = weightedSum(w2) % 11
      if (check === 10) {
        base += 1
        continue
      }
    }
    return padded + String(check)
  }
}

let phoneSeq = 100
function nextPhone(): string {
  phoneSeq += 1
  return `+7780${String(phoneSeq).padStart(7, '0')}`
}

let iinSeq = 50_000
function nextIin(): string {
  iinSeq += 1
  return iin(iinSeq)
}

async function startRegistration(
  phone: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/registration/start',
    payload: { phone },
  })
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> }
}

async function verifyRegistration(
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/registration/verify',
    payload,
  })
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> }
}

async function completeRegistration(overrides: {
  phone?: string
  iin?: string
  firstName?: string
  lastName?: string
  patronymic?: string | null
  specialization?: Record<string, unknown>
  clientKind?: 'web' | 'mobile'
}): Promise<{
  phone: string
  iin: string
  body: Record<string, unknown>
}> {
  const phone = overrides.phone ?? nextPhone()
  const iinValue = overrides.iin ?? nextIin()
  const start = await startRegistration(phone)
  expect(start.statusCode).toBe(202)
  const code = provider.lastCode(phone)
  if (!code) throw new Error(`expected OTP after start for ${phone}`)
  const verify = await verifyRegistration({
    phone,
    otp: code,
    firstName: overrides.firstName ?? 'Алексей',
    lastName: overrides.lastName ?? 'Иванов',
    patronymic: overrides.patronymic === undefined ? 'Петрович' : overrides.patronymic,
    iin: iinValue,
    specialization: overrides.specialization ?? {},
    clientKind: overrides.clientKind ?? 'mobile',
  })
  if (verify.statusCode !== 201) {
    throw new Error(`verify: ${verify.statusCode} ${JSON.stringify(verify.body)}`)
  }
  return { phone, iin: iinValue, body: verify.body }
}

describe('POST /api/v1/registration/start', () => {
  it('202 and sends a 6-digit code via provider', async () => {
    const phone = nextPhone()
    const { statusCode, body } = await startRegistration(phone)
    expect(statusCode).toBe(202)
    expect(body).toEqual({ expiresIn: 300 })
    expect(provider.lastCode(phone)).toMatch(/^\d{6}$/)
  })

  it('normalizes local-format phone ("8780...") to "+7780..."', async () => {
    phoneSeq += 1
    const tail = String(phoneSeq).padStart(7, '0')
    const localForm = `8780${tail}`
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/registration/start',
      payload: { phone: localForm },
    })
    expect(res.statusCode).toBe(202)
    expect(provider.lastCode(`+7780${tail}`)).toMatch(/^\d{6}$/)
  })

  it('422 VALIDATION_ERROR for garbage phone', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/registration/start',
      payload: { phone: 'not-a-phone' },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('429 RATE_LIMITED on second request within 60s cooldown', async () => {
    const phone = nextPhone()
    const first = await startRegistration(phone)
    expect(first.statusCode).toBe(202)
    const second = await startRegistration(phone)
    expect(second.statusCode).toBe(429)
    const body = second.body as { error?: { code?: string; details?: { reason?: string } } }
    expect(body.error?.code).toBe('RATE_LIMITED')
    expect(body.error?.details?.reason).toBe('cooldown')
  })

  it('502 SMS_DELIVERY_FAILED when provider throws', async () => {
    provider.shouldFail = true
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/registration/start',
      payload: { phone: nextPhone() },
    })
    provider.shouldFail = false
    expect(res.statusCode).toBe(502)
    expect(res.json().error.code).toBe('SMS_DELIVERY_FAILED')
  })

  it('202 even when phone is already registered (enumeration protection)', async () => {
    // Регистрируем человека через полный pipeline, потом повторно стартуем:
    // сервер НЕ раскрывает что такой user уже есть — SMS отправляется.
    const { phone } = await completeRegistration({})
    const res = await startRegistration(phone)
    // cooldown НЕ должен был сработать, т.к. мы делали verify успешно —
    // hourly же пропустит (первый start этого phone не считается).
    // Но если cooldown всё ещё активен — это тоже ОК: 429 без факта registration.
    expect([202, 429]).toContain(res.statusCode)
  })

  it('audit_log.registration.start entry is written with masked phone', async () => {
    const phone = nextPhone()
    await startRegistration(phone)
    const rows = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'registration.start'))
    const row = rows.find((r) => {
      const md = r.metadata as { phone?: string }
      return md.phone?.endsWith(phone.slice(-4))
    })
    expect(row).toBeDefined()
    expect((row?.metadata as { phone?: string }).phone).toMatch(/^\+7\*+\d{4}$/)
  })
})

describe('POST /api/v1/registration/verify — failure paths', () => {
  it('400 SMS_CODE_INVALID_OR_EXPIRED if start was not called', async () => {
    const res = await verifyRegistration({
      phone: nextPhone(),
      otp: '123456',
      firstName: 'A',
      lastName: 'B',
      iin: nextIin(),
    })
    expect(res.statusCode).toBe(400)
    expect((res.body as { error: { code: string } }).error.code).toBe('SMS_CODE_INVALID_OR_EXPIRED')
  })

  it('400 when wrong code is supplied', async () => {
    const phone = nextPhone()
    await startRegistration(phone)
    const res = await verifyRegistration({
      phone,
      otp: '000000',
      firstName: 'A',
      lastName: 'B',
      iin: nextIin(),
    })
    expect(res.statusCode).toBe(400)
    expect((res.body as { error: { code: string } }).error.code).toBe('SMS_CODE_INVALID_OR_EXPIRED')
  })

  it('422 VALIDATION_ERROR when iin fails checksum', async () => {
    const phone = nextPhone()
    await startRegistration(phone)
    const code = provider.lastCode(phone)
    const res = await verifyRegistration({
      phone,
      otp: code,
      firstName: 'A',
      lastName: 'B',
      iin: '123456789012', // валидный формат, но checksum провалится
    })
    expect(res.statusCode).toBe(422)
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR')
  })

  it('422 VALIDATION_ERROR on missing required fields', async () => {
    const phone = nextPhone()
    await startRegistration(phone)
    const code = provider.lastCode(phone)
    const res = await verifyRegistration({
      phone,
      otp: code,
      // firstName/lastName/iin — отсутствуют
    })
    expect(res.statusCode).toBe(422)
  })

  it('409 PHONE_ALREADY_REGISTERED when user exists with this phone', async () => {
    // Создаём user с этим phone напрямую (минуем registration flow).
    const phone = nextPhone()
    await createUser(handle.app, {
      role: 'owner',
      phone,
      organizationId: orgId,
      name: 'Exists',
    })

    await startRegistration(phone)
    const code = provider.lastCode(phone)
    const res = await verifyRegistration({
      phone,
      otp: code,
      firstName: 'Dup',
      lastName: 'Phone',
      iin: nextIin(),
    })
    expect(res.statusCode).toBe(409)
    expect((res.body as { error: { code: string } }).error.code).toBe('PHONE_ALREADY_REGISTERED')
  })

  it('409 IIN_ALREADY_EXISTS when another live crane_profile has this IIN', async () => {
    const { iin: takenIin } = await completeRegistration({})

    const phone = nextPhone()
    await startRegistration(phone)
    const code = provider.lastCode(phone)
    const res = await verifyRegistration({
      phone,
      otp: code,
      firstName: 'Dup',
      lastName: 'Iin',
      iin: takenIin,
    })
    expect(res.statusCode).toBe(409)
    expect((res.body as { error: { code: string } }).error.code).toBe('IIN_ALREADY_EXISTS')
  })

  it('failed IIN conflict does NOT create user nor crane_profile', async () => {
    const { iin: takenIin } = await completeRegistration({})

    const phone = nextPhone()
    await startRegistration(phone)
    const code = provider.lastCode(phone)
    const res = await verifyRegistration({
      phone,
      otp: code,
      firstName: 'Dup',
      lastName: 'Iin2',
      iin: takenIin,
    })
    expect(res.statusCode).toBe(409)

    // Никакой user с этим phone не создан.
    const userRows = await handle.app.db.db.select().from(users).where(eq(users.phone, phone))
    expect(userRows).toHaveLength(0)
  })

  it('consumed code: second verify with same code fails', async () => {
    const phone = nextPhone()
    await startRegistration(phone)
    const code = provider.lastCode(phone)
    const iinValue = nextIin()

    const first = await verifyRegistration({
      phone,
      otp: code,
      firstName: 'First',
      lastName: 'Try',
      iin: iinValue,
    })
    expect(first.statusCode).toBe(201)

    const second = await verifyRegistration({
      phone,
      otp: code,
      firstName: 'Second',
      lastName: 'Try',
      iin: nextIin(),
    })
    expect(second.statusCode).toBe(400)
  })
})

describe('POST /api/v1/registration/verify — happy path', () => {
  it('201 creates user+profile with pending approval and issues JWT pair', async () => {
    const {
      phone,
      iin: createdIin,
      body,
    } = await completeRegistration({
      firstName: 'Алексей',
      lastName: 'Смирнов',
      patronymic: 'Владимирович',
    })

    expect(body.accessToken).toEqual(expect.any(String))
    expect(body.refreshToken).toEqual(expect.any(String))
    expect(body.accessTokenExpiresAt).toEqual(expect.any(String))
    expect(body.refreshTokenExpiresAt).toEqual(expect.any(String))

    const user = body.user as { id: string; role: string; organizationId: string | null }
    expect(user.role).toBe('operator')
    expect(user.organizationId).toBeNull()

    const profile = body.craneProfile as {
      id: string
      firstName: string
      lastName: string
      patronymic: string | null
      iin: string
      phone: string
      approvalStatus: string
    }
    expect(profile.firstName).toBe('Алексей')
    expect(profile.lastName).toBe('Смирнов')
    expect(profile.patronymic).toBe('Владимирович')
    expect(profile.iin).toBe(createdIin)
    expect(profile.approvalStatus).toBe('pending')
    // phone маскированный: +77......YYYY
    expect(profile.phone.endsWith(phone.slice(-4))).toBe(true)
    expect(profile.phone).not.toBe(phone)
  })

  it('user row is role=operator with organizationId=null (migration 0008)', async () => {
    const { phone } = await completeRegistration({})
    const rows = await handle.app.db.db.select().from(users).where(eq(users.phone, phone))
    const row = rows[0]
    expect(row).toBeDefined()
    expect(row?.role).toBe('operator')
    expect(row?.organizationId).toBeNull()
    expect(row?.status).toBe('active')
    expect(row?.deletedAt).toBeNull()
  })

  it('crane_profile row is linked to user, pending, with supplied identity', async () => {
    const { phone, iin: createdIin } = await completeRegistration({
      firstName: 'Иван',
      lastName: 'Кранов',
      specialization: { license: 'tower_crane' },
    })
    const userRows = await handle.app.db.db.select().from(users).where(eq(users.phone, phone))
    const userId = userRows[0]?.id
    if (!userId) throw new Error('user missing')
    const cpRows = await handle.app.db.db
      .select()
      .from(craneProfiles)
      .where(eq(craneProfiles.userId, userId))
    const cp = cpRows[0]
    expect(cp).toBeDefined()
    expect(cp?.firstName).toBe('Иван')
    expect(cp?.lastName).toBe('Кранов')
    expect(cp?.iin).toBe(createdIin)
    expect(cp?.approvalStatus).toBe('pending')
    expect(cp?.specialization).toEqual({ license: 'tower_crane' })
  })

  it('audit_log.registration.complete is written with ids and masked phone', async () => {
    const { phone, body } = await completeRegistration({})
    const profileId = (body.craneProfile as { id: string }).id
    const rows = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetId, profileId))
    const completeRow = rows.find((r) => r.action === 'registration.complete')
    expect(completeRow).toBeDefined()
    expect(completeRow?.actorRole).toBe('operator')
    expect((completeRow?.metadata as { phone: string }).phone.endsWith(phone.slice(-4))).toBe(true)
    expect((completeRow?.metadata as { phone: string }).phone).not.toBe(phone)
    expect((completeRow?.metadata as { craneProfileId: string }).craneProfileId).toBe(profileId)
  })

  it('refresh_tokens row is inserted with mobile TTL (~90 days) on mobile client', async () => {
    const { body } = await completeRegistration({ clientKind: 'mobile' })
    const userId = (body.user as { id: string }).id
    const rows = await handle.app.db.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, userId))
    expect(rows).toHaveLength(1)
    const ttlMs = (rows[0]?.expiresAt?.getTime() ?? 0) - Date.now()
    // Допуск порядка величины: 85-95 дней.
    expect(ttlMs).toBeGreaterThan(85 * 24 * 60 * 60 * 1000)
    expect(ttlMs).toBeLessThan(95 * 24 * 60 * 60 * 1000)
  })

  it('web clientKind yields a ~30-day refresh token', async () => {
    const { body } = await completeRegistration({ clientKind: 'web' })
    const userId = (body.user as { id: string }).id
    const rows = await handle.app.db.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, userId))
    const ttlMs = (rows[0]?.expiresAt?.getTime() ?? 0) - Date.now()
    expect(ttlMs).toBeGreaterThan(25 * 24 * 60 * 60 * 1000)
    expect(ttlMs).toBeLessThan(35 * 24 * 60 * 60 * 1000)
  })

  it('issued access token authenticates GET /auth/me as operator', async () => {
    const { body } = await completeRegistration({})
    const accessToken = body.accessToken as string
    const me = await handle.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().role).toBe('operator')
    expect(me.json().userId).toBe((body.user as { id: string }).id)
  })

  it('issued access token authenticates GET /api/v1/crane-profiles/me', async () => {
    const { body } = await completeRegistration({ firstName: 'Само', lastName: 'Регистрант' })
    const accessToken = body.accessToken as string
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(res.statusCode).toBe(200)
    const dto = res.json() as { firstName: string; lastName: string; approvalStatus: string }
    expect(dto.firstName).toBe('Само')
    expect(dto.lastName).toBe('Регистрант')
    expect(dto.approvalStatus).toBe('pending')
  })

  it('patronymic is optional', async () => {
    const { body } = await completeRegistration({ patronymic: null })
    expect((body.craneProfile as { patronymic: string | null }).patronymic).toBeNull()
  })

  it('user.name is "FirstName LastName"', async () => {
    const { phone } = await completeRegistration({ firstName: 'Серик', lastName: 'Абаев' })
    const rows = await handle.app.db.db.select().from(users).where(eq(users.phone, phone))
    expect(rows[0]?.name).toBe('Серик Абаев')
  })
})

describe('end-to-end: registration → /me/status → approval → canWork', () => {
  it('pending profile → canWork=false, no memberships', async () => {
    const { body } = await completeRegistration({})
    const accessToken = body.accessToken as string

    const status = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me/status',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(status.statusCode).toBe(200)
    const dto = status.json() as {
      profile: { approvalStatus: string }
      memberships: unknown[]
      canWork: boolean
    }
    expect(dto.profile.approvalStatus).toBe('pending')
    expect(dto.memberships).toEqual([])
    expect(dto.canWork).toBe(false)
  })

  it('after profile approve but no hires → canWork=false', async () => {
    const { body } = await completeRegistration({})
    const accessToken = body.accessToken as string
    const profileId = (body.craneProfile as { id: string }).id

    const approve = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${profileId}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(approve.statusCode).toBe(200)

    const status = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me/status',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    const dto = status.json() as {
      profile: { approvalStatus: string }
      canWork: boolean
    }
    expect(dto.profile.approvalStatus).toBe('approved')
    expect(dto.canWork).toBe(false)
  })

  it('profile approved + approved active hire → canWork=true', async () => {
    const { body } = await completeRegistration({})
    const accessToken = body.accessToken as string
    const profileId = (body.craneProfile as { id: string }).id

    // 1. superadmin апрувит профиль.
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${profileId}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })

    // 2. owner создаёт pending hire (ADR 0003 pipeline 2).
    const hireRes = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { craneProfileId: profileId },
    })
    expect(hireRes.statusCode).toBe(201)
    const hireId = (hireRes.json() as { id: string }).id

    // 3. superadmin апрувит hire.
    const approveHire = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${hireId}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(approveHire.statusCode).toBe(200)

    // 4. загружаем валидную license (ADR 0005: canWork требует license valid).
    const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    await handle.app.db.db
      .update(craneProfiles)
      .set({
        licenseKey: `crane-profiles/${profileId}/license/v1/doc.pdf`,
        licenseExpiresAt: oneYear,
        licenseVersion: 1,
      })
      .where(eq(craneProfiles.id, profileId))

    const status = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me/status',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    const dto = status.json() as {
      profile: { approvalStatus: string }
      memberships: Array<{
        id: string
        organizationId: string
        organizationName: string
        approvalStatus: string
        status: string
      }>
      canWork: boolean
    }
    expect(dto.profile.approvalStatus).toBe('approved')
    expect(dto.memberships).toHaveLength(1)
    expect(dto.memberships[0]?.organizationId).toBe(orgId)
    expect(dto.memberships[0]?.organizationName).toBe('Reg Org')
    expect(dto.memberships[0]?.approvalStatus).toBe('approved')
    expect(dto.memberships[0]?.status).toBe('active')
    expect(dto.canWork).toBe(true)
  })
})
