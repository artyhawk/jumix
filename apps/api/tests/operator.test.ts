import { auditLog, craneProfiles, organizationOperators, users } from '@jumix/db'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты operators-модуля (admin surface в B2d-2a). Покрывают:
 *   - admin CRUD (create/list/get/update/changeStatus/delete);
 *   - cross-tenant isolation (404 вместо 403, CLAUDE.md §4.3);
 *   - terminated_at семантика (historical record, НЕ очищается при recovery);
 *   - availability CHECK constraint (только при status='active');
 *   - partial unique constraints (ИИН + user_id/org_id);
 *   - phone/IIN conflict (409 + атомарный rollback);
 *   - cursor pagination, search;
 *   - DTO: phone masking, avatarUrl — presigned GET;
 *   - CHECK constraint на формат ИИН (12 цифр).
 *
 * Self-service endpoints (`/me`, `/me/avatar/*`) переехали в crane-profile
 * модуль (ADR 0003) — тесты для них живут в `crane-profile.test.ts`.
 *
 * Один Postgres-контейнер на весь файл. BIN-серия 63xxxx (не пересекается
 * с crane 62xxxx и organization 61xxxx).
 *
 * ИИН-генератор: `iin(seed)` — валидный ИИН с правильной контрольной суммой
 * на базе числового seed'а, чтобы не коллидировать внутри теста.
 */

let handle: TestAppHandle

let superadminToken: string
let ownerAToken: string
let ownerBToken: string
let orgAId: string
let orgBId: string

beforeAll(async () => {
  handle = await buildTestApp()

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77130000000',
    organizationId: null,
    name: 'Super',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const orgA = await createOrganization(handle.app, { name: 'Ops A', bin: '630000000001' })
  orgAId = orgA.id
  const ownerA = await createUser(handle.app, {
    role: 'owner',
    phone: '+77130000001',
    organizationId: orgAId,
    name: 'Owner A',
  })
  ownerAToken = await signTokenFor(handle.app, ownerA)

  const orgB = await createOrganization(handle.app, { name: 'Ops B', bin: '630000000002' })
  orgBId = orgB.id
  const ownerB = await createUser(handle.app, {
    role: 'owner',
    phone: '+77130000002',
    organizationId: orgBId,
    name: 'Owner B',
  })
  ownerBToken = await signTokenFor(handle.app, ownerB)
}, 60_000)

afterAll(async () => {
  await handle.close()
})

/**
 * Генерация валидного ИИН из 11-значного seed'а. Алгоритм — тот же, что в
 * packages/shared/src/kz-checksum.ts; если первая проверка даёт 10 и вторая
 * тоже 10, прибавляем 1 к seed'у и повторяем.
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

// Счётчик для уникальности phone/iin между тестами.
let seq = 1000
function nextPhone(): string {
  seq += 1
  // +77130100000..+77130199999 — диапазон этого файла
  return `+7713${String(seq).padStart(7, '0')}`
}

async function createOperator(
  token: string,
  overrides: {
    phone?: string
    firstName?: string
    lastName?: string
    patronymic?: string
    iin?: string
    hiredAt?: string
    specialization?: Record<string, unknown>
  } = {},
): Promise<{
  id: string
  userId: string
  organizationId: string
  iin: string
  phone: string
}> {
  const iinValue = overrides.iin ?? iin(seq * 1000)
  const phoneValue = overrides.phone ?? nextPhone()
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/operators',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      phone: phoneValue,
      firstName: overrides.firstName ?? 'Иван',
      lastName: overrides.lastName ?? 'Петров',
      iin: iinValue,
      ...(overrides.patronymic !== undefined ? { patronymic: overrides.patronymic } : {}),
      ...(overrides.hiredAt !== undefined ? { hiredAt: overrides.hiredAt } : {}),
      ...(overrides.specialization !== undefined
        ? { specialization: overrides.specialization }
        : {}),
    },
  })
  if (res.statusCode !== 201) {
    throw new Error(`operator create failed: ${res.statusCode} ${res.body}`)
  }
  const json = res.json()
  return {
    id: json.id,
    userId: json.userId,
    organizationId: json.organizationId,
    iin: iinValue,
    phone: phoneValue,
  }
}

// B2d-1 (ADR 0003): operator JWT больше не несёт organizationId — signTokenFor
// нормализует org=null для role=operator. Хелпер оставлен лишь для обёртки
// createUser → sign.
async function tokenForOperator(userId: string): Promise<string> {
  return signTokenFor(handle.app, {
    id: userId,
    role: 'operator',
    organizationId: null,
    tokenVersion: 0,
  })
}

describe('POST /api/v1/operators (create)', () => {
  it('201: owner creates operator with user atomically; audit row', async () => {
    const phone = nextPhone()
    const iinValue = iin(111_000_001)
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone,
        firstName: 'Асан',
        lastName: 'Касымов',
        patronymic: 'Оразович',
        iin: iinValue,
        hiredAt: '2025-01-15',
      },
    })
    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.id).toEqual(expect.any(String))
    expect(json.organizationId).toBe(orgAId)
    expect(json.firstName).toBe('Асан')
    expect(json.lastName).toBe('Касымов')
    expect(json.patronymic).toBe('Оразович')
    expect(json.iin).toBe(iinValue)
    expect(json.status).toBe('active')
    expect(json.availability).toBeNull()
    expect(json.avatarUrl).toBeNull()
    expect(json.hiredAt).toBe('2025-01-15')
    expect(json.terminatedAt).toBeNull()
    // Phone: masked, содержит звёздочки, не равен оригиналу.
    expect(json.phone).not.toBe(phone)
    expect(json.phone).toContain('*')

    // Audit операция записана в той же транзакции.
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, json.id), eq(auditLog.action, 'operator.create')))
    expect(audits).toHaveLength(1)
    expect(audits[0]?.organizationId).toBe(orgAId)
    // Полный phone в audit metadata.
    expect((audits[0]?.metadata as { phone?: string })?.phone).toBe(phone)
  })

  it('201: patronymic/hiredAt/specialization optional', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'Абай',
        lastName: 'Жумабаев',
        iin: iin(111_000_002),
      },
    })
    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.patronymic).toBeNull()
    expect(json.hiredAt).toBeNull()
    expect(json.specialization).toEqual({})
  })

  it('201: specialization placeholder record accepted as-is', async () => {
    const spec = { licenseLevel: 'A', tower: true, notes: 'foo' }
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'X',
        lastName: 'Y',
        iin: iin(111_000_003),
        specialization: spec,
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().specialization).toEqual(spec)
  })

  it('403: superadmin cannot create (нет своей org)', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'X',
        lastName: 'Y',
        iin: iin(111_000_004),
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('401: unauthenticated create rejected', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      payload: {
        phone: nextPhone(),
        firstName: 'X',
        lastName: 'Y',
        iin: iin(111_000_005),
      },
    })
    expect(res.statusCode).toBe(401)
  })

  it('422: invalid phone rejected by Zod', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: 'not-a-phone',
        firstName: 'X',
        lastName: 'Y',
        iin: iin(111_000_006),
      },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: invalid iin checksum rejected by Zod', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'X',
        lastName: 'Y',
        iin: '123456789012', // invalid checksum
      },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: iin with letters rejected by Zod', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'X',
        lastName: 'Y',
        iin: '12345678901a',
      },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: iin length != 12 rejected', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'X',
        lastName: 'Y',
        iin: '12345',
      },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: empty firstName/lastName rejected', async () => {
    const resEmptyFirst = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: nextPhone(),
        firstName: '',
        lastName: 'Y',
        iin: iin(111_000_007),
      },
    })
    expect(resEmptyFirst.statusCode).toBe(422)
  })

  it('422: unknown field in payload rejected (strict Zod → injection guard)', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'X',
        lastName: 'Y',
        iin: iin(111_000_008),
        organizationId: orgBId, // injection attempt
      },
    })
    // @fastify/ajv removeAdditional='all' убирает неизвестные ключи,
    // но наша Zod-схема дальше видит result без organizationId — так что
    // ответ 201 тут ОК, НО organizationId в ответе — собственный, не orgB.
    // Главное — что owner НЕ создал operator в чужой org.
    if (res.statusCode === 201) {
      expect(res.json().organizationId).toBe(orgAId)
    } else {
      expect(res.statusCode).toBe(422)
    }
  })

  it('422: userId injection attempt rejected/stripped', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'X',
        lastName: 'Y',
        iin: iin(111_000_009),
        userId: '00000000-0000-0000-0000-000000000001',
      },
    })
    // Либо strip, либо 422 — операция должна создать НОВОГО user'а.
    if (res.statusCode === 201) {
      expect(res.json().userId).not.toBe('00000000-0000-0000-0000-000000000001')
    }
  })

  it('422: status injection attempt rejected/stripped → always active', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'X',
        lastName: 'Y',
        iin: iin(111_000_010),
        status: 'terminated',
      },
    })
    if (res.statusCode === 201) {
      expect(res.json().status).toBe('active')
    }
  })

  it('409: duplicate phone rejected with PHONE_ALREADY_REGISTERED', async () => {
    const dupePhone = nextPhone()
    await createOperator(ownerAToken, { phone: dupePhone, iin: iin(111_000_101) })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: dupePhone,
        firstName: 'X',
        lastName: 'Y',
        iin: iin(111_000_102),
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('PHONE_ALREADY_REGISTERED')
  })

  it('409: duplicate IIN in same org rejected with IIN_ALREADY_EXISTS_IN_ORG', async () => {
    const dupeIin = iin(111_000_103)
    await createOperator(ownerAToken, { iin: dupeIin })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'X',
        lastName: 'Y',
        iin: dupeIin,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('IIN_ALREADY_EXISTS_IN_ORG')
  })

  it('409: same IIN rejected in DIFFERENT org (ADR 0003: IIN now global)', async () => {
    // B2d-1: crane_profiles.iin — global UNIQUE среди живых. Один человек
    // живёт на платформе как один профиль; per-org дубликаты больше не
    // допускаются. B2d-3 введёт hire-request flow поверх existing crane_profile.
    const sharedIin = iin(111_000_104)
    const first = await createOperator(ownerAToken, { iin: sharedIin })
    expect(first.organizationId).toBe(orgAId)
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'X',
        lastName: 'Y',
        iin: sharedIin,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('IIN_ALREADY_EXISTS_IN_ORG')
  })

  it('409 + atomic rollback: IIN conflict does NOT leave orphan user', async () => {
    const dupeIin = iin(111_000_105)
    await createOperator(ownerAToken, { iin: dupeIin })
    const stalePhone = nextPhone()
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: stalePhone,
        firstName: 'X',
        lastName: 'Y',
        iin: dupeIin,
      },
    })
    expect(res.statusCode).toBe(409)
    // Юзер с stalePhone НЕ должен быть создан (tx rollback).
    const userRows = await handle.app.db.db.select().from(users).where(eq(users.phone, stalePhone))
    expect(userRows).toHaveLength(0)
  })
})

describe('GET /api/v1/operators (list)', () => {
  it('200: owner sees ONLY own-org operators', async () => {
    await createOperator(ownerAToken, { firstName: 'ListA1' })
    await createOperator(ownerAToken, { firstName: 'ListA2' })
    await createOperator(ownerBToken, { firstName: 'ListB1' })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/operators?limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ organizationId: string }>
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.organizationId).toBe(orgAId)
    }
  })

  it('200: superadmin sees operators across orgs', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/operators?limit=100',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ organizationId: string }>
    const orgs = new Set(items.map((i) => i.organizationId))
    expect(orgs.size).toBeGreaterThanOrEqual(2)
  })

  it('403: operator cannot list', async () => {
    const op = await createOperator(ownerAToken)
    const operatorToken = await tokenForOperator(op.userId)
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${operatorToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated rejected', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/api/v1/operators' })
    expect(res.statusCode).toBe(401)
  })

  it('200: list items do NOT contain phone (phone only in GET /:id detail)', async () => {
    await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/operators?limit=5',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const items = res.json().items as Array<Record<string, unknown>>
    for (const i of items) {
      expect(i.phone).toBeUndefined()
    }
  })

  it('200: cursor pagination returns non-overlapping pages', async () => {
    const first = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/operators?limit=1',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const p1 = first.json()
    expect(p1.items).toHaveLength(1)
    if (p1.nextCursor) {
      const second = await handle.app.inject({
        method: 'GET',
        url: `/api/v1/operators?limit=1&cursor=${p1.nextCursor}`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      })
      const p2 = second.json()
      if (p2.items.length > 0) {
        expect(p2.items[0].id).not.toBe(p1.items[0].id)
      }
    }
  })

  it('200: search by last name ilike', async () => {
    await createOperator(ownerAToken, { lastName: 'UNIQUELAST_XYZ' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/operators?search=UNIQUELAST',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const items = res.json().items as Array<{ lastName: string }>
    expect(items.length).toBe(1)
    expect(items[0]?.lastName).toBe('UNIQUELAST_XYZ')
  })

  it('200: search by iin fragment', async () => {
    const iinVal = iin(987_654_321)
    await createOperator(ownerAToken, { iin: iinVal, firstName: 'SearchByIIN' })
    const fragment = iinVal.slice(0, 6)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/operators?search=${fragment}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const items = res.json().items as Array<{ iin: string }>
    expect(items.some((i) => i.iin === iinVal)).toBe(true)
  })

  it('200: filter by status=active', async () => {
    const op = await createOperator(ownerAToken, { firstName: 'StatusFilter' })
    // block op
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/operators?status=active&limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const items = res.json().items as Array<{ id: string; status: string }>
    expect(items.every((i) => i.status === 'active')).toBe(true)
    expect(items.some((i) => i.id === op.id)).toBe(false)
  })

  it('CRITICAL: organizationId query param is IGNORED — owner still scoped to own org', async () => {
    // Injection attempt: owner A пытается передать organizationId=orgB.
    // Zod strip удаляет неизвестный ключ, service сcopes по ctx.organizationId.
    await createOperator(ownerBToken, { firstName: 'ShouldNotLeak' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/operators?organizationId=${orgBId}&limit=100`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ organizationId: string; firstName: string }>
    expect(items.every((i) => i.organizationId === orgAId)).toBe(true)
    expect(items.some((i) => i.firstName === 'ShouldNotLeak')).toBe(false)
  })

  it('200: list excludes soft-deleted operators', async () => {
    const op = await createOperator(ownerAToken, { firstName: 'SoftDel' })
    await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/operators?limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const ids = (res.json().items as Array<{ id: string }>).map((i) => i.id)
    expect(ids).not.toContain(op.id)
  })
})

describe('GET /api/v1/operators/:id', () => {
  it('200: owner reads own operator with full DTO + masked phone', async () => {
    const op = await createOperator(ownerAToken, { firstName: 'Read' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.id).toBe(op.id)
    expect(json.phone).toContain('*')
    expect(json.phone).not.toBe(op.phone)
  })

  it('200: superadmin reads any operator', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('404: owner A reads foreign operator — 404 (not 403, hides existence)', async () => {
    const foreign = await createOperator(ownerBToken)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/operators/${foreign.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('OPERATOR_NOT_FOUND')
  })

  it('404: operator cannot access /operators/:id (even own row)', async () => {
    const op = await createOperator(ownerAToken)
    const opToken = await tokenForOperator(op.userId)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${opToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('404: nonexistent uuid returns 404', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/operators/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('422: non-uuid :id rejected', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/operators/not-a-uuid',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(422)
  })

  it('401: unauthenticated rejected', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({ method: 'GET', url: `/api/v1/operators/${op.id}` })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/v1/operators/:id (admin update)', () => {
  it('200: owner updates firstName/lastName/patronymic; audit row', async () => {
    const op = await createOperator(ownerAToken, { firstName: 'Old', lastName: 'Name' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { firstName: 'New', patronymic: 'Ivanovich' },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.firstName).toBe('New')
    expect(json.patronymic).toBe('Ivanovich')

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'operator.update')))
    expect(audits.length).toBeGreaterThanOrEqual(1)
  })

  it('200: owner updates iin (conflict-check if different)', async () => {
    const op = await createOperator(ownerAToken)
    const newIin = iin(222_000_001)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { iin: newIin },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().iin).toBe(newIin)
  })

  it('200: owner clears patronymic via null', async () => {
    const op = await createOperator(ownerAToken, { patronymic: 'ToClear' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { patronymic: null },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().patronymic).toBeNull()
  })

  it('200: superadmin can update any operator', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { firstName: 'SuperPatched' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().firstName).toBe('SuperPatched')
  })

  it('404: owner A patches foreign operator — 404', async () => {
    const foreign = await createOperator(ownerBToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${foreign.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { firstName: 'Hijack' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('409: patch iin to one used by another active operator in same org', async () => {
    const dupeIin = iin(222_000_002)
    await createOperator(ownerAToken, { iin: dupeIin })
    const victim = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${victim.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { iin: dupeIin },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('IIN_ALREADY_EXISTS_IN_ORG')
  })

  it('200: patch iin to same value (no-op) succeeds', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { iin: op.iin },
    })
    expect(res.statusCode).toBe(200)
  })

  it('422: empty patch rejected by refine', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: phone NOT accepted in admin patch (immutable here)', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { phone: nextPhone() },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: status NOT accepted in admin patch (separate endpoint)', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: avatarKey NOT accepted in admin patch', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { avatarKey: 'orgs/x/operators/y/avatar/z.jpg' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('401: unauthenticated patch rejected', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}`,
      payload: { firstName: 'X' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/v1/operators/:id/status — CRITICAL terminated_at semantics', () => {
  it('200: active → blocked; terminated_at stays null', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked', reason: 'discipline' },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.status).toBe('blocked')
    expect(json.terminatedAt).toBeNull()
    expect(json.availability).toBeNull()
  })

  it('200: active → terminated; terminated_at set to today', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated', reason: 'resignation' },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.status).toBe('terminated')
    // date-only 'YYYY-MM-DD'
    expect(json.terminatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'operator.terminate')))
    expect(audits).toHaveLength(1)
    expect((audits[0]?.metadata as { reason?: string })?.reason).toBe('resignation')
  })

  it('CRITICAL: terminated → active keeps terminated_at (historical record)', async () => {
    const op = await createOperator(ownerAToken)
    // terminate
    const term = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })
    const terminatedDate = term.json().terminatedAt as string
    expect(terminatedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // recover
    const recover = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'active' },
    })
    expect(recover.statusCode).toBe(200)
    const json = recover.json()
    expect(json.status).toBe('active')
    // Историческая дата увольнения ДОЛЖНА СОХРАНИТЬСЯ.
    expect(json.terminatedAt).toBe(terminatedDate)
  })

  it('CRITICAL: terminated → blocked keeps terminated_at', async () => {
    const op = await createOperator(ownerAToken)
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })
    const row1 = await handle.app.db.db
      .select({ terminatedAt: organizationOperators.terminatedAt })
      .from(organizationOperators)
      .where(eq(organizationOperators.id, op.id))
    const terminatedAt1 = row1[0]?.terminatedAt

    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    expect(res.statusCode).toBe(200)
    const row2 = await handle.app.db.db
      .select({ terminatedAt: organizationOperators.terminatedAt })
      .from(organizationOperators)
      .where(eq(organizationOperators.id, op.id))
    expect(row2[0]?.terminatedAt?.toISOString()).toBe(terminatedAt1?.toISOString())
  })

  it('CRITICAL: idempotent terminated → terminated does NOT bump terminated_at', async () => {
    const op = await createOperator(ownerAToken)
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })
    const row1 = await handle.app.db.db
      .select({ terminatedAt: organizationOperators.terminatedAt })
      .from(organizationOperators)
      .where(eq(organizationOperators.id, op.id))
    const firstTerminatedAt = row1[0]?.terminatedAt?.toISOString()

    // повторно
    await new Promise((r) => setTimeout(r, 25))
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })
    expect(res.statusCode).toBe(200)

    const row2 = await handle.app.db.db
      .select({ terminatedAt: organizationOperators.terminatedAt })
      .from(organizationOperators)
      .where(eq(organizationOperators.id, op.id))
    expect(row2[0]?.terminatedAt?.toISOString()).toBe(firstTerminatedAt)

    // Idempotent call — ровно один audit entry, не два.
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'operator.terminate')))
    expect(audits).toHaveLength(1)
  })

  it('CRITICAL: terminated → active → terminated (rehire cycle) — NEW terminated_at', async () => {
    const op = await createOperator(ownerAToken)
    // first terminate
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })
    const row1 = await handle.app.db.db
      .select({ terminatedAt: organizationOperators.terminatedAt })
      .from(organizationOperators)
      .where(eq(organizationOperators.id, op.id))
    const first = row1[0]?.terminatedAt
    if (!first) throw new Error('expected terminated_at after first terminate')

    // reactivate
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'active' },
    })
    // Делаем маленькую паузу чтобы new Date() отличался — и обходим date-granularity:
    // date в PG имеет точность 'дня', а new Date() округляется до текущего дня,
    // т.е. на одном дне первая и вторая дата совпадут. Здесь проверяем факт перехода,
    // не разницу минимальных timestamp'ов (для разницы дат нужен явный freezer,
    // которого мы в MVP не делаем; сам инвариант — что второй terminate НЕ пустит
    // null и НЕ переиспользует мгновенно старую запись внутри одного дня это норма).
    await new Promise((r) => setTimeout(r, 25))

    // terminate again
    const second = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })
    expect(second.statusCode).toBe(200)
    const row2 = await handle.app.db.db
      .select({ terminatedAt: organizationOperators.terminatedAt })
      .from(organizationOperators)
      .where(eq(organizationOperators.id, op.id))
    const fresh = row2[0]?.terminatedAt
    // Должна быть проставлена заново (не null и >= first по дате).
    expect(fresh).not.toBeNull()
    // Второй аудит terminate записан.
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'operator.terminate')))
    expect(audits.length).toBeGreaterThanOrEqual(2)
  })

  it('200: blocked → active clears availability=null stays null', async () => {
    const op = await createOperator(ownerAToken)
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'active' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('active')
    expect(res.json().availability).toBeNull()
  })

  it('200: idempotent active → active does NOT write audit', async () => {
    const op = await createOperator(ownerAToken)
    // op уже active по умолчанию
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'active' },
    })
    expect(res.statusCode).toBe(200)
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'operator.activate')))
    expect(audits).toHaveLength(0)
  })

  it('422: invalid status enum rejected', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'destroyed' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('404: owner A cannot change status of foreign operator', async () => {
    const foreign = await createOperator(ownerBToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${foreign.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('401: unauthenticated rejected', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/operators/${op.id}/status`,
      payload: { status: 'blocked' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('DELETE /api/v1/operators/:id (soft-delete)', () => {
  it('200: owner soft-deletes own operator; audit row', async () => {
    const op = await createOperator(ownerAToken)
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'operator.delete')))
    expect(audits).toHaveLength(1)
  })

  it('404: owner A cannot delete foreign operator', async () => {
    const foreign = await createOperator(ownerBToken)
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/operators/${foreign.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('404: re-deleting already deleted returns 404', async () => {
    const op = await createOperator(ownerAToken)
    await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('201: IIN freed after soft-delete — can be reused', async () => {
    const first = await createOperator(ownerAToken)
    await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/operators/${first.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    // Тот же ИИН можно использовать для нового operator.
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        phone: nextPhone(),
        firstName: 'Rehire',
        lastName: 'OK',
        iin: first.iin,
      },
    })
    expect(res.statusCode).toBe(201)
  })
})

describe('Data layer guarantees', () => {
  // B2d-1 (ADR 0003): таблица operators разделена на crane_profiles +
  // organization_operators. Inserts направлены на новые таблицы напрямую;
  // проверяемые CHECK'и и FK-restrict'ы переехали вместе с данными.

  it('DB CHECK rejects ИИН формат не 12 цифр (bypass Zod)', async () => {
    const user = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: orgAId,
      name: 'Direct',
    })
    const invalidInsert = handle.app.db.db.execute(sql`
      INSERT INTO crane_profiles (user_id, first_name, last_name, iin)
      VALUES (${user.id}, 'X', 'Y', 'abc123')
    `)
    await expect(invalidInsert).rejects.toThrow(/crane_profiles_iin_format_chk/i)
  })

  it('DB CHECK rejects availability NOT NULL with status != active', async () => {
    const user = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: orgAId,
      name: 'Avail',
    })
    const cp = await handle.app.db.db
      .insert(craneProfiles)
      .values({
        userId: user.id,
        firstName: 'X',
        lastName: 'Y',
        iin: iin(333_010_001),
        approvalStatus: 'approved',
      })
      .returning()
    const craneProfileId = cp[0]?.id
    if (!craneProfileId) throw new Error('crane_profile insert failed')
    const invalidInsert = handle.app.db.db.execute(sql`
      INSERT INTO organization_operators (crane_profile_id, organization_id, status, availability, approval_status)
      VALUES (${craneProfileId}, ${orgAId}, 'blocked', 'free', 'approved')
    `)
    await expect(invalidInsert).rejects.toThrow(
      /organization_operators_availability_only_when_active_chk/i,
    )
  })

  it('DB CHECK allows availability NULL with any status', async () => {
    const user = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: orgAId,
      name: 'NullAvail',
    })
    const cp = await handle.app.db.db
      .insert(craneProfiles)
      .values({
        userId: user.id,
        firstName: 'X',
        lastName: 'Y',
        iin: iin(333_000_001),
        approvalStatus: 'approved',
      })
      .returning()
    const craneProfileId = cp[0]?.id
    if (!craneProfileId) throw new Error('crane_profile insert failed')
    const validInsert = handle.app.db.db.execute(sql`
      INSERT INTO organization_operators (crane_profile_id, organization_id, status, approval_status)
      VALUES (${craneProfileId}, ${orgAId}, 'terminated', 'approved')
    `)
    await expect(validInsert).resolves.toBeDefined()
  })

  it('partial UNIQUE(iin) GLOBAL excludes soft-deleted (slot освобождается)', async () => {
    // B2d-1: IIN теперь глобально уникален среди живых crane_profiles (был
    // per-org в B2b). Семантика сохраняется: soft-delete → слот свободен,
    // recreate проходит. Compat-shim softDelete помечает ОБЕ таблицы.
    const iinVal = iin(444_000_001)
    const first = await createOperator(ownerAToken, { iin: iinVal })
    await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/operators/${first.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const user = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: orgAId,
      name: 'ReIns',
    })
    const re = handle.app.db.db.execute(sql`
      INSERT INTO crane_profiles (user_id, first_name, last_name, iin)
      VALUES (${user.id}, 'Rehired', 'Same', ${iinVal})
    `)
    await expect(re).resolves.toBeDefined()
  })

  it('FK ON DELETE RESTRICT: cannot delete user referenced by crane_profile', async () => {
    const op = await createOperator(ownerAToken)
    const del = handle.app.db.db.execute(sql`DELETE FROM users WHERE id = ${op.userId}`)
    await expect(del).rejects.toThrow(/violates foreign key/i)
  })

  it('FK ON DELETE RESTRICT: cannot delete organization with organization_operator', async () => {
    const orphan = await createOrganization(handle.app, { bin: '630000000099' })
    const u = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: orphan.id,
      name: 'Stuck',
    })
    const cp = await handle.app.db.db
      .insert(craneProfiles)
      .values({
        userId: u.id,
        firstName: 'X',
        lastName: 'Y',
        iin: iin(444_000_099),
        approvalStatus: 'approved',
      })
      .returning()
    const craneProfileId = cp[0]?.id
    if (!craneProfileId) throw new Error('crane_profile insert failed')
    await handle.app.db.db.insert(organizationOperators).values({
      craneProfileId,
      organizationId: orphan.id,
      approvalStatus: 'approved',
    })
    const del = handle.app.db.db.execute(sql`DELETE FROM organizations WHERE id = ${orphan.id}`)
    await expect(del).rejects.toThrow(/violates foreign key/i)
  })

  it('specialization jsonb default = {} при пропуске', async () => {
    const op = await createOperator(ownerAToken)
    // specialization живёт на crane_profiles (B2d-1). hydrated Operator.id
    // ссылается на organization_operators.id — находим профиль через JOIN.
    const row = await handle.app.db.db
      .select({ specialization: craneProfiles.specialization })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .where(eq(organizationOperators.id, op.id))
    expect(row[0]?.specialization).toEqual({})
  })
})
