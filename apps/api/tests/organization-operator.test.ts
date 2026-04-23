import { auditLog, craneProfiles, organizationOperators } from '@jumix/db'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты organization-operators-модуля (ADR 0003 pipeline 2 +
 * authorization.md §4.2b/§4.2c). Покрывают:
 *   - hire workflow: POST принимает только {craneProfileId, hiredAt?}, создаёт
 *     pending hire; owner не одобряет свою же заявку (holding-approval);
 *   - approve/reject (superadmin-only, pipeline 2): pending → approved/rejected;
 *     не-pending → 409; rejected → read-only для update, delete — разрешён;
 *   - approval-gate на update/changeStatus: pending hire нельзя оперативно трогать;
 *   - identity живёт на crane_profile — softDelete ТОЛЬКО hire; identity остаётся;
 *   - terminated_at semantics: historical date сохраняется при recovery;
 *   - cross-tenant isolation (404 вместо 403, CLAUDE.md §4.3);
 *   - DTO: nested `craneProfile` (без N+1), phone — только в detail endpoint,
 *     в списке отсутствует;
 *   - multi-org: тот же crane_profile живёт в N организациях независимыми
 *     pipeline'ами (approve в orgA не влияет на orgB).
 *
 * Один Postgres-контейнер на весь файл. BIN-серия 65xxxx + phone +7715xxxxxxx —
 * не пересекаются с operator (63xxxx/+7713) и crane-profile (64xxxx/+7714).
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
    phone: '+77150000000',
    organizationId: null,
    name: 'Super',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const orgA = await createOrganization(handle.app, { name: 'Hire A', bin: '650000000001' })
  orgAId = orgA.id
  const ownerA = await createUser(handle.app, {
    role: 'owner',
    phone: '+77150000001',
    organizationId: orgAId,
    name: 'Owner A',
  })
  ownerAToken = await signTokenFor(handle.app, ownerA)

  const orgB = await createOrganization(handle.app, { name: 'Hire B', bin: '650000000002' })
  orgBId = orgB.id
  const ownerB = await createUser(handle.app, {
    role: 'owner',
    phone: '+77150000002',
    organizationId: orgBId,
    name: 'Owner B',
  })
  ownerBToken = await signTokenFor(handle.app, ownerB)
}, 60_000)

afterAll(async () => {
  await handle.close()
})

/**
 * Валидный ИИН из 11-значного seed'а (алгоритм — shared/kz-checksum).
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

let seq = 3000
function nextPhone(): string {
  seq += 1
  return `+7715${String(seq).padStart(7, '0')}`
}

type ProfileRef = {
  craneProfileId: string
  userId: string
  phone: string
  iin: string
}

/**
 * Создаёт user + pending crane_profile напрямую в БД (без hire). Identity
 * остаётся pending — для тестов CRANE_PROFILE_NOT_APPROVED.
 */
async function createPendingProfile(
  overrides: { iin?: string; lastName?: string } = {},
): Promise<ProfileRef> {
  const phone = nextPhone()
  const user = await createUser(handle.app, {
    role: 'operator',
    phone,
    organizationId: orgAId,
    name: 'Pending',
  })
  const iinValue = overrides.iin ?? iin(seq * 991)
  const rows = await handle.app.db.db
    .insert(craneProfiles)
    .values({
      userId: user.id,
      firstName: 'Ivan',
      lastName: overrides.lastName ?? 'Petrov',
      iin: iinValue,
      approvalStatus: 'pending',
    })
    .returning({ id: craneProfiles.id })
  const id = rows[0]?.id
  if (!id) throw new Error('pending profile insert failed')
  return { craneProfileId: id, userId: user.id, phone, iin: iinValue }
}

/**
 * Pending профиль + approve через superadmin endpoint. Возвращает approved
 * профиль, готовый к hire.
 */
async function createApprovedProfile(
  overrides: { iin?: string; lastName?: string } = {},
): Promise<ProfileRef> {
  const pending = await createPendingProfile(overrides)
  const res = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/crane-profiles/${pending.craneProfileId}/approve`,
    headers: { authorization: `Bearer ${superadminToken}` },
  })
  if (res.statusCode !== 200) {
    throw new Error(`approve profile failed: ${res.statusCode} ${res.body}`)
  }
  return pending
}

/**
 * Rejected профиль — для тестов 409 при hire.
 */
async function createRejectedProfile(): Promise<ProfileRef> {
  const pending = await createPendingProfile()
  const res = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/crane-profiles/${pending.craneProfileId}/reject`,
    headers: { authorization: `Bearer ${superadminToken}` },
    payload: { reason: 'fake-docs' },
  })
  if (res.statusCode !== 200) {
    throw new Error(`reject profile failed: ${res.statusCode} ${res.body}`)
  }
  return pending
}

type HireRef = {
  id: string
  organizationId: string
  craneProfileId: string
  userId: string
  phone: string
}

/** POST hire (pending). Не одобряет. Для approve/reject-тестов. */
async function createPendingHire(
  ownerToken: string,
  profile: ProfileRef,
  hiredAt?: string,
): Promise<HireRef> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/organization-operators',
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: {
      craneProfileId: profile.craneProfileId,
      ...(hiredAt !== undefined ? { hiredAt } : {}),
    },
  })
  if (res.statusCode !== 201) {
    throw new Error(`hire (pending) failed: ${res.statusCode} ${res.body}`)
  }
  const json = res.json() as { id: string; organizationId: string }
  return {
    id: json.id,
    organizationId: json.organizationId,
    craneProfileId: profile.craneProfileId,
    userId: profile.userId,
    phone: profile.phone,
  }
}

/** Pending hire + approve через superadmin. Готовый operational hire. */
async function createApprovedHire(
  ownerToken: string,
  profile: ProfileRef,
  hiredAt?: string,
): Promise<HireRef> {
  const pending = await createPendingHire(ownerToken, profile, hiredAt)
  const approve = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/organization-operators/${pending.id}/approve`,
    headers: { authorization: `Bearer ${superadminToken}` },
  })
  if (approve.statusCode !== 200) {
    throw new Error(`approve hire failed: ${approve.statusCode} ${approve.body}`)
  }
  return pending
}

/**
 * Shortcut: approved профиль + approved hire в одной org.
 */
async function createOperationalHire(
  ownerToken: string,
  overrides: { hiredAt?: string; lastName?: string } = {},
): Promise<HireRef> {
  const profile = await createApprovedProfile({ lastName: overrides.lastName })
  return createApprovedHire(ownerToken, profile, overrides.hiredAt)
}

async function tokenForOperator(userId: string): Promise<string> {
  return signTokenFor(handle.app, {
    id: userId,
    role: 'operator',
    organizationId: null,
    tokenVersion: 0,
  })
}

// ---------------------------------------------------------------------------
// POST /api/v1/organization-operators (hire)
// ---------------------------------------------------------------------------

describe('POST /api/v1/organization-operators (hire)', () => {
  it('201: owner hires approved profile → pending hire + audit', async () => {
    const profile = await createApprovedProfile({ lastName: 'Kasymov' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        craneProfileId: profile.craneProfileId,
        hiredAt: '2025-01-15',
      },
    })
    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.id).toEqual(expect.any(String))
    expect(json.organizationId).toBe(orgAId)
    expect(json.craneProfileId).toBe(profile.craneProfileId)
    expect(json.hiredAt).toBe('2025-01-15')
    expect(json.terminatedAt).toBeNull()
    expect(json.status).toBe('active')
    expect(json.availability).toBeNull()
    expect(json.approvalStatus).toBe('pending')
    expect(json.approvedAt).toBeNull()
    expect(json.rejectedAt).toBeNull()
    // list-DTO (без phone в nested craneProfile).
    expect(json.craneProfile.id).toBe(profile.craneProfileId)
    expect(json.craneProfile.iin).toBe(profile.iin)
    expect(json.craneProfile.lastName).toBe('Kasymov')
    expect(json.craneProfile.approvalStatus).toBe('approved')
    expect(json.craneProfile.phone).toBeUndefined()
    // licenseStatus computed на boundary (B3-UI-3c): нет удостоверения → 'missing'.
    expect(json.craneProfile.licenseStatus).toBe('missing')
    expect(json.craneProfile.licenseExpiresAt).toBeNull()

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.targetId, json.id), eq(auditLog.action, 'organization_operator.submit')),
      )
    expect(audits).toHaveLength(1)
    expect(audits[0]?.organizationId).toBe(orgAId)
  })

  it('201: hiredAt optional (null)', async () => {
    const profile = await createApprovedProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { craneProfileId: profile.craneProfileId },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().hiredAt).toBeNull()
    expect(res.json().approvalStatus).toBe('pending')
  })

  it('403: superadmin cannot hire (нет собственной org)', async () => {
    const profile = await createApprovedProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { craneProfileId: profile.craneProfileId },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('403: operator cannot hire', async () => {
    const profile = await createApprovedProfile()
    const opToken = await tokenForOperator(profile.userId)
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${opToken}` },
      payload: { craneProfileId: profile.craneProfileId },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated rejected', async () => {
    const profile = await createApprovedProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      payload: { craneProfileId: profile.craneProfileId },
    })
    expect(res.statusCode).toBe(401)
  })

  it('422: craneProfileId must be uuid', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { craneProfileId: 'not-a-uuid' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: missing craneProfileId', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: strict schema rejects unknown field (injection guard)', async () => {
    const profile = await createApprovedProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        craneProfileId: profile.craneProfileId,
        organizationId: orgBId, // injection attempt — strict strip/reject
      },
    })
    // ajv removeAdditional='all' вычищает неизвестные ключи; если Zod strict
    // видит пустой extra — проходит; остаётся лишь убедиться, что org = own.
    if (res.statusCode === 201) {
      expect(res.json().organizationId).toBe(orgAId)
    } else {
      expect(res.statusCode).toBe(422)
    }
  })

  it('422: approvalStatus injection stripped — всегда pending', async () => {
    const profile = await createApprovedProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        craneProfileId: profile.craneProfileId,
        approvalStatus: 'approved',
      },
    })
    if (res.statusCode === 201) {
      expect(res.json().approvalStatus).toBe('pending')
    } else {
      expect(res.statusCode).toBe(422)
    }
  })

  it('404: CRANE_PROFILE_NOT_FOUND for unknown uuid', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { craneProfileId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('CRANE_PROFILE_NOT_FOUND')
  })

  it('409: CRANE_PROFILE_NOT_APPROVED for pending profile', async () => {
    const pending = await createPendingProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { craneProfileId: pending.craneProfileId },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_PROFILE_NOT_APPROVED')
  })

  it('409: CRANE_PROFILE_NOT_APPROVED for rejected profile', async () => {
    const rejected = await createRejectedProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { craneProfileId: rejected.craneProfileId },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_PROFILE_NOT_APPROVED')
  })

  it('409: OPERATOR_ALREADY_HIRED when hiring same profile twice into same org', async () => {
    const profile = await createApprovedProfile()
    await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { craneProfileId: profile.craneProfileId },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('OPERATOR_ALREADY_HIRED')
  })
})

// ---------------------------------------------------------------------------
// GET /api/v1/organization-operators (list)
// ---------------------------------------------------------------------------

describe('GET /api/v1/organization-operators (list)', () => {
  it('200: owner видит только own-org hires', async () => {
    await createOperationalHire(ownerAToken, { lastName: 'ListA1' })
    await createOperationalHire(ownerAToken, { lastName: 'ListA2' })
    await createOperationalHire(ownerBToken, { lastName: 'ListB1' })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators?limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ organizationId: string }>
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.organizationId).toBe(orgAId)
    }
  })

  it('200: superadmin видит across orgs', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators?limit=100',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ organizationId: string }>
    const orgs = new Set(items.map((i) => i.organizationId))
    expect(orgs.size).toBeGreaterThanOrEqual(2)
  })

  it('200: approvalStatus default=approved — pending hires hidden', async () => {
    const profile = await createApprovedProfile({ lastName: 'HiddenPending' })
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators?limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const ids = (res.json().items as Array<{ id: string }>).map((i) => i.id)
    expect(ids).not.toContain(pending.id)
  })

  it('200: approvalStatus=pending фильтрует approval queue', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators?approvalStatus=pending&limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ id: string; approvalStatus: string }>
    expect(items.every((i) => i.approvalStatus === 'pending')).toBe(true)
    expect(items.some((i) => i.id === pending.id)).toBe(true)
  })

  it('200: approvalStatus=all возвращает и approved, и pending, и rejected', async () => {
    const approved = await createOperationalHire(ownerAToken)
    const pendingProfile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, pendingProfile)
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators?approvalStatus=all&limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const ids = new Set((res.json().items as Array<{ id: string }>).map((i) => i.id))
    expect(ids.has(approved.id)).toBe(true)
    expect(ids.has(pending.id)).toBe(true)
  })

  it('200: list items содержат nested craneProfile (анти-N+1), БЕЗ phone', async () => {
    await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators?limit=5',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const items = res.json().items as Array<{
      craneProfile: { id: string; iin: string; firstName: string; phone?: unknown }
    }>
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.craneProfile).toBeDefined()
      expect(item.craneProfile.id).toEqual(expect.any(String))
      expect(item.craneProfile.iin).toEqual(expect.any(String))
      expect(item.craneProfile.firstName).toEqual(expect.any(String))
      expect(item.craneProfile.phone).toBeUndefined()
    }
  })

  it('200: cursor pagination — non-overlapping страницы', async () => {
    const first = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators?limit=1',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const p1 = first.json()
    expect(p1.items).toHaveLength(1)
    if (p1.nextCursor) {
      const second = await handle.app.inject({
        method: 'GET',
        url: `/api/v1/organization-operators?limit=1&cursor=${p1.nextCursor}`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      })
      const p2 = second.json()
      if (p2.items.length > 0) {
        expect(p2.items[0].id).not.toBe(p1.items[0].id)
      }
    }
  })

  it('200: search по lastName ilike', async () => {
    await createOperationalHire(ownerAToken, { lastName: 'UNIQUESEARCH_LN' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators?search=UNIQUESEARCH',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const items = res.json().items as Array<{ craneProfile: { lastName: string } }>
    expect(items.length).toBe(1)
    expect(items[0]?.craneProfile.lastName).toBe('UNIQUESEARCH_LN')
  })

  it('200: search по iin fragment', async () => {
    const profile = await createApprovedProfile({ iin: iin(777_000_001) })
    await createApprovedHire(ownerAToken, profile)
    const fragment = profile.iin.slice(0, 6)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators?search=${fragment}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const items = res.json().items as Array<{ craneProfile: { iin: string } }>
    expect(items.some((i) => i.craneProfile.iin === profile.iin)).toBe(true)
  })

  it('200: filter by status=active excludes blocked', async () => {
    const op = await createOperationalHire(ownerAToken, { lastName: 'StatusFilter' })
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators?status=active&limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const items = res.json().items as Array<{ id: string; status: string }>
    expect(items.every((i) => i.status === 'active')).toBe(true)
    expect(items.some((i) => i.id === op.id)).toBe(false)
  })

  it('200: filter by craneProfileId (superadmin cross-org history)', async () => {
    const profile = await createApprovedProfile()
    const hireA = await createApprovedHire(ownerAToken, profile)
    const hireB = await createApprovedHire(ownerBToken, profile)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators?craneProfileId=${profile.craneProfileId}&limit=100`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const ids = (res.json().items as Array<{ id: string }>).map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining([hireA.id, hireB.id]))
  })

  it('200: superadmin organizationId filter — narrow-down by org', async () => {
    await createOperationalHire(ownerBToken, { lastName: 'OrgBNarrow' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators?organizationId=${orgBId}&limit=100`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ organizationId: string }>
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((i) => i.organizationId === orgBId)).toBe(true)
  })

  it('CRITICAL: owner organizationId query param IGNORED — scope стабилен', async () => {
    await createOperationalHire(ownerBToken, { lastName: 'LeakCheck' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators?organizationId=${orgBId}&limit=100`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{
      organizationId: string
      craneProfile: { lastName: string }
    }>
    expect(items.every((i) => i.organizationId === orgAId)).toBe(true)
    expect(items.some((i) => i.craneProfile.lastName === 'LeakCheck')).toBe(false)
  })

  it('200: list excludes soft-deleted', async () => {
    const op = await createOperationalHire(ownerAToken, { lastName: 'SoftDel' })
    await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators?limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const ids = (res.json().items as Array<{ id: string }>).map((i) => i.id)
    expect(ids).not.toContain(op.id)
  })

  it('403: operator cannot list', async () => {
    const profile = await createApprovedProfile()
    const token = await tokenForOperator(profile.userId)
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/api/v1/organization-operators' })
    expect(res.statusCode).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// GET /api/v1/organization-operators/:id
// ---------------------------------------------------------------------------

describe('GET /api/v1/organization-operators/:id', () => {
  it('200: owner reads own hire — full DTO с phone (masked) в nested craneProfile', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.id).toBe(op.id)
    expect(json.craneProfile.phone).toContain('*')
    expect(json.craneProfile.phone).not.toBe(op.phone)
  })

  it('200: superadmin reads any hire', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().craneProfile.phone).toContain('*')
  })

  it('404: owner A reads foreign hire — 404 (hide existence)', async () => {
    const foreign = await createOperationalHire(ownerBToken)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators/${foreign.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('ORGANIZATION_OPERATOR_NOT_FOUND')
  })

  it('404: operator cannot access admin detail even for own hire', async () => {
    const op = await createOperationalHire(ownerAToken)
    const opToken = await tokenForOperator(op.userId)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${opToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('404: nonexistent uuid', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('422: non-uuid :id', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators/not-a-uuid',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(422)
  })

  it('401: unauthenticated', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators/${op.id}`,
    })
    expect(res.statusCode).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/v1/organization-operators/:id (admin update) — approval-gated
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/organization-operators/:id (admin update)', () => {
  it('200: owner updates hiredAt + audit', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { hiredAt: '2025-06-01' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().hiredAt).toBe('2025-06-01')

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'organization_operator.update')))
    expect(audits.length).toBeGreaterThanOrEqual(1)
  })

  it('200: owner clears hiredAt via null', async () => {
    const op = await createOperationalHire(ownerAToken, { hiredAt: '2025-01-01' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { hiredAt: null },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().hiredAt).toBeNull()
  })

  it('200: superadmin can update any hire', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { hiredAt: '2026-01-01' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().hiredAt).toBe('2026-01-01')
  })

  it('409: update pending hire → ORGANIZATION_OPERATOR_NOT_APPROVED', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${pending.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { hiredAt: '2025-05-01' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('ORGANIZATION_OPERATOR_NOT_APPROVED')
  })

  it('409: update rejected hire → ORGANIZATION_OPERATOR_REJECTED_READONLY', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'not needed' },
    })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${pending.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { hiredAt: '2025-05-01' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('ORGANIZATION_OPERATOR_REJECTED_READONLY')
  })

  it('404: owner A patches foreign hire', async () => {
    const foreign = await createOperationalHire(ownerBToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${foreign.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { hiredAt: '2025-01-01' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('422: empty patch rejected (refine)', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: status NOT accepted (separate endpoint)', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: craneProfileId NOT accepted (immutable)', async () => {
    const op = await createOperationalHire(ownerAToken)
    const other = await createApprovedProfile()
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { craneProfileId: other.craneProfileId },
    })
    expect(res.statusCode).toBe(422)
  })

  it('401: unauthenticated', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}`,
      payload: { hiredAt: '2025-01-01' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// PATCH /:id/status — CRITICAL terminated_at + approval-gate
// ---------------------------------------------------------------------------

describe('PATCH /:id/status — CRITICAL terminated_at semantics', () => {
  it('200: active → blocked; terminated_at stays null', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked', reason: 'discipline' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('blocked')
    expect(res.json().terminatedAt).toBeNull()
    expect(res.json().availability).toBeNull()
  })

  it('200: active → terminated; terminated_at = today + audit', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated', reason: 'resignation' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().terminatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'organization_operator.terminate')),
      )
    expect(audits).toHaveLength(1)
    expect((audits[0]?.metadata as { reason?: string })?.reason).toBe('resignation')
  })

  it('CRITICAL: terminated → active — 409 INVALID_STATUS_TRANSITION (terminal)', async () => {
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })
    const recover = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'active' },
    })
    expect(recover.statusCode).toBe(409)
    expect(recover.json().error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('CRITICAL: terminated → blocked — 409 INVALID_STATUS_TRANSITION (terminal)', async () => {
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('CRITICAL: idempotent terminated → terminated — NOT bump + NO new audit', async () => {
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })
    const row1 = await handle.app.db.db
      .select({ terminatedAt: organizationOperators.terminatedAt })
      .from(organizationOperators)
      .where(eq(organizationOperators.id, op.id))
    const first = row1[0]?.terminatedAt?.toISOString()

    await new Promise((r) => setTimeout(r, 25))
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })
    expect(res.statusCode).toBe(200)
    const row2 = await handle.app.db.db
      .select({ terminatedAt: organizationOperators.terminatedAt })
      .from(organizationOperators)
      .where(eq(organizationOperators.id, op.id))
    expect(row2[0]?.terminatedAt?.toISOString()).toBe(first)

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'organization_operator.terminate')),
      )
    expect(audits).toHaveLength(1)
  })

  it('CRITICAL: rehire after terminate requires new hire request (terminal invariant)', async () => {
    // После увольнения owner создаёт новый hire-request; identity на
    // crane_profile сохраняется — softDelete освобождает UNIQUE-слот.
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })
    const delRes = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(delRes.statusCode).toBe(200)

    const rehire = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { craneProfileId: op.craneProfileId },
    })
    expect(rehire.statusCode).toBe(201)
    expect(rehire.json().id).not.toBe(op.id)
    expect(rehire.json().approvalStatus).toBe('pending')
  })

  it('200: idempotent active → active — no audit row', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'active' },
    })
    expect(res.statusCode).toBe(200)
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'organization_operator.activate')),
      )
    expect(audits).toHaveLength(0)
  })

  it('200: blocked → active; availability stays null', async () => {
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'active' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('active')
    expect(res.json().availability).toBeNull()
  })

  it('409: changeStatus на pending hire → ORGANIZATION_OPERATOR_NOT_APPROVED', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${pending.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('ORGANIZATION_OPERATOR_NOT_APPROVED')
  })

  it('409: changeStatus на rejected hire → ORGANIZATION_OPERATOR_REJECTED_READONLY', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'nope' },
    })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${pending.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('ORGANIZATION_OPERATOR_REJECTED_READONLY')
  })

  it('422: invalid status enum', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'destroyed' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('404: owner A cannot change status of foreign hire', async () => {
    const foreign = await createOperationalHire(ownerBToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${foreign.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('401: unauthenticated', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${op.id}/status`,
      payload: { status: 'blocked' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// POST /:id/{block,activate,terminate} — owner convenience wrappers
// ---------------------------------------------------------------------------

describe('POST /:id/block', () => {
  it('200: owner blocks active hire + reason in audit', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/block`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { reason: 'disciplinary' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('blocked')
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'organization_operator.block')))
    expect(audits).toHaveLength(1)
    expect((audits[0]?.metadata as { reason?: string })?.reason).toBe('disciplinary')
  })

  it('200: owner blocks without reason (optional)', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/block`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('blocked')
  })

  it('409: INVALID_STATUS_TRANSITION when blocking terminated', async () => {
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/terminate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/block`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('404: owner A cannot block foreign hire', async () => {
    const foreign = await createOperationalHire(ownerBToken)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${foreign.id}/block`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /:id/activate', () => {
  it('200: owner activates blocked hire + audit', async () => {
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/block`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/activate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('active')
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'organization_operator.activate')),
      )
    expect(audits).toHaveLength(1)
  })

  it('200: idempotent — activate already active returns 200 no audit', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/activate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'organization_operator.activate')),
      )
    expect(audits).toHaveLength(0)
  })

  it('409: INVALID_STATUS_TRANSITION when activating terminated', async () => {
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/terminate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/activate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION')
  })
})

describe('POST /:id/terminate', () => {
  it('200: owner terminates active hire + terminatedAt + audit', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/terminate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('terminated')
    expect(res.json().terminatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'organization_operator.terminate')),
      )
    expect(audits).toHaveLength(1)
  })

  it('200: owner terminates blocked hire', async () => {
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/block`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/terminate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('terminated')
  })

  it('CRITICAL: terminated is terminal — cannot block/activate after', async () => {
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/terminate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const blockRes = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/block`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(blockRes.statusCode).toBe(409)
    expect(blockRes.json().error.code).toBe('INVALID_STATUS_TRANSITION')

    const activateRes = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/activate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(activateRes.statusCode).toBe(409)
    expect(activateRes.json().error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('403: operator cannot terminate', async () => {
    const op = await createOperationalHire(ownerAToken)
    const pf = await handle.app.db.db
      .select({ userId: craneProfiles.userId })
      .from(craneProfiles)
      .where(eq(craneProfiles.id, op.craneProfileId))
    const opToken = await tokenForOperator(pf[0]?.userId ?? '')
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/terminate`,
      headers: { authorization: `Bearer ${opToken}` },
    })
    // operator не проходит канал list/get (404) — endpoint доступен но возвращает 404.
    expect([403, 404]).toContain(res.statusCode)
  })

  it('CRITICAL: foreign org — 404', async () => {
    const foreign = await createOperationalHire(ownerBToken)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${foreign.id}/terminate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// DELETE /:id (soft-delete) — only hire, identity persists
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/organization-operators/:id', () => {
  it('200: owner soft-deletes own hire + audit row', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, op.id), eq(auditLog.action, 'organization_operator.delete')))
    expect(audits).toHaveLength(1)
  })

  it('200: owner can delete rejected hire (cleanup path)', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'legal fail' },
    })
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/organization-operators/${pending.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('200: owner can delete pending hire', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/organization-operators/${pending.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('CRITICAL: soft-delete hire does NOT soft-delete crane_profile (identity persists)', async () => {
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const rows = await handle.app.db.db
      .select({ deletedAt: craneProfiles.deletedAt, approvalStatus: craneProfiles.approvalStatus })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .where(eq(organizationOperators.id, op.id))
    expect(rows[0]?.deletedAt).toBeNull()
    expect(rows[0]?.approvalStatus).toBe('approved')
  })

  it('201: UNIQUE slot freed after soft-delete — re-hire same profile same org allowed', async () => {
    const profile = await createApprovedProfile()
    const first = await createApprovedHire(ownerAToken, profile)
    await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/organization-operators/${first.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { craneProfileId: profile.craneProfileId },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().id).not.toBe(first.id)
  })

  it('404: owner A cannot delete foreign hire', async () => {
    const foreign = await createOperationalHire(ownerBToken)
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/organization-operators/${foreign.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('404: re-deleting already deleted', async () => {
    const op = await createOperationalHire(ownerAToken)
    await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/organization-operators/${op.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// POST /:id/approve — pipeline 2 superadmin-only
// ---------------------------------------------------------------------------

describe('POST /api/v1/organization-operators/:id/approve', () => {
  it('200: superadmin approves pending → approved + approvedAt + audit', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().approvalStatus).toBe('approved')
    expect(res.json().approvedAt).toEqual(expect.any(String))
    expect(res.json().rejectedAt).toBeNull()

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, pending.id),
          eq(auditLog.action, 'organization_operator.approve'),
        ),
      )
    expect(audits).toHaveLength(1)
  })

  it('409: ORGANIZATION_OPERATOR_NOT_PENDING — already approved', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('ORGANIZATION_OPERATOR_NOT_PENDING')
  })

  it('409: ORGANIZATION_OPERATOR_NOT_PENDING — already rejected', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'no' },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('ORGANIZATION_OPERATOR_NOT_PENDING')
  })

  it('403: owner cannot approve own request (external actor invariant)', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/approve`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403: operator cannot approve', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const opToken = await tokenForOperator(profile.userId)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/approve`,
      headers: { authorization: `Bearer ${opToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('404: nonexistent uuid', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators/00000000-0000-0000-0000-000000000000/approve',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('401: unauthenticated', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/approve`,
    })
    expect(res.statusCode).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// POST /:id/reject
// ---------------------------------------------------------------------------

describe('POST /api/v1/organization-operators/:id/reject', () => {
  it('200: superadmin rejects pending + reason + audit', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'Документы не проходят проверку' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().approvalStatus).toBe('rejected')
    expect(res.json().rejectionReason).toBe('Документы не проходят проверку')
    expect(res.json().rejectedAt).toEqual(expect.any(String))
    expect(res.json().approvedAt).toBeNull()

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.targetId, pending.id), eq(auditLog.action, 'organization_operator.reject')),
      )
    expect(audits).toHaveLength(1)
  })

  it('200: rejected hire visible in list с approvalStatus=rejected', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'fail' },
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organization-operators?approvalStatus=rejected&limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const items = res.json().items as Array<{ id: string; approvalStatus: string }>
    expect(items.some((i) => i.id === pending.id && i.approvalStatus === 'rejected')).toBe(true)
  })

  it('409: ORGANIZATION_OPERATOR_NOT_PENDING — already approved', async () => {
    const op = await createOperationalHire(ownerAToken)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${op.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'late' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('ORGANIZATION_OPERATOR_NOT_PENDING')
  })

  it('409: ORGANIZATION_OPERATOR_NOT_PENDING — already rejected', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'first' },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'second' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('403: owner cannot reject', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/reject`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { reason: 'self-reject' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('422: reason required', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: empty reason rejected', async () => {
    const profile = await createApprovedProfile()
    const pending = await createPendingHire(ownerAToken, profile)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: '   ' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('404: nonexistent uuid', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators/00000000-0000-0000-0000-000000000000/reject',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'ghost' },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Multi-org scenarios (ADR 0003 core)
// ---------------------------------------------------------------------------

describe('Multi-org scenarios (same crane_profile across orgs)', () => {
  it('201: same approved profile can be hired in two different orgs', async () => {
    const profile = await createApprovedProfile()
    const hireA = await createPendingHire(ownerAToken, profile)
    const hireB = await createPendingHire(ownerBToken, profile)
    expect(hireA.id).not.toBe(hireB.id)
    expect(hireA.organizationId).toBe(orgAId)
    expect(hireB.organizationId).toBe(orgBId)
  })

  it('CRITICAL: approve hire in orgA does NOT affect hire in orgB (independent pipelines)', async () => {
    const profile = await createApprovedProfile()
    const hireA = await createPendingHire(ownerAToken, profile)
    const hireB = await createPendingHire(ownerBToken, profile)

    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${hireA.id}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })

    const resA = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators/${hireA.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    const resB = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators/${hireB.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(resA.json().approvalStatus).toBe('approved')
    expect(resB.json().approvalStatus).toBe('pending')
  })

  it('CRITICAL: reject hire in orgA does NOT affect hire in orgB', async () => {
    const profile = await createApprovedProfile()
    const hireA = await createPendingHire(ownerAToken, profile)
    const hireB = await createPendingHire(ownerBToken, profile)

    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organization-operators/${hireA.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'conflict with orgA' },
    })

    const resA = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators/${hireA.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    const resB = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators/${hireB.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(resA.json().approvalStatus).toBe('rejected')
    expect(resB.json().approvalStatus).toBe('pending')
  })

  it('CRITICAL: terminating hire in orgA does NOT terminate hire in orgB', async () => {
    const profile = await createApprovedProfile()
    const hireA = await createApprovedHire(ownerAToken, profile)
    const hireB = await createApprovedHire(ownerBToken, profile)

    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${hireA.id}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'terminated' },
    })

    const resA = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators/${hireA.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    const resB = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators/${hireB.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(resA.json().status).toBe('terminated')
    expect(resB.json().status).toBe('active')
  })

  it('owner A scope isolation: видит только свой hire, не видит hire в orgB той же profile', async () => {
    const profile = await createApprovedProfile()
    const hireA = await createApprovedHire(ownerAToken, profile)
    const hireB = await createApprovedHire(ownerBToken, profile)

    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organization-operators?craneProfileId=${profile.craneProfileId}&limit=100`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const ids = (res.json().items as Array<{ id: string }>).map((i) => i.id)
    expect(ids).toContain(hireA.id)
    expect(ids).not.toContain(hireB.id)
  })
})

// ---------------------------------------------------------------------------
// Data layer guarantees
// ---------------------------------------------------------------------------

describe('Data layer guarantees', () => {
  it('DB CHECK: availability NOT NULL with status != active rejected', async () => {
    const user = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: orgAId,
      name: 'DirectAvail',
    })
    const cp = await handle.app.db.db
      .insert(craneProfiles)
      .values({
        userId: user.id,
        firstName: 'X',
        lastName: 'Y',
        iin: iin(888_000_001),
        approvalStatus: 'approved',
      })
      .returning()
    const craneProfileId = cp[0]?.id
    if (!craneProfileId) throw new Error('profile insert failed')
    const invalid = handle.app.db.db.execute(sql`
      INSERT INTO organization_operators (crane_profile_id, organization_id, status, availability, approval_status)
      VALUES (${craneProfileId}, ${orgAId}, 'blocked', 'free', 'approved')
    `)
    await expect(invalid).rejects.toThrow(
      /organization_operators_availability_only_when_active_chk/i,
    )
  })

  it('partial UNIQUE(crane_profile_id, organization_id) WHERE deleted_at IS NULL — blocks duplicate active hire', async () => {
    const profile = await createApprovedProfile()
    await createPendingHire(ownerAToken, profile)
    // Вторая попытка через API → 409 (pre-check ловит)
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organization-operators',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { craneProfileId: profile.craneProfileId },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('OPERATOR_ALREADY_HIRED')
  })

  it('FK ON DELETE RESTRICT: cannot delete organization with live organization_operator', async () => {
    const orphan = await createOrganization(handle.app, { bin: '650000000099' })
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
        iin: iin(888_000_099),
        approvalStatus: 'approved',
      })
      .returning()
    const craneProfileId = cp[0]?.id
    if (!craneProfileId) throw new Error('profile insert failed')
    await handle.app.db.db.insert(organizationOperators).values({
      craneProfileId,
      organizationId: orphan.id,
      approvalStatus: 'approved',
    })
    const del = handle.app.db.db.execute(sql`DELETE FROM organizations WHERE id = ${orphan.id}`)
    await expect(del).rejects.toThrow(/violates foreign key/i)
  })

  it('FK ON DELETE RESTRICT: cannot delete crane_profile with live organization_operator', async () => {
    const op = await createOperationalHire(ownerAToken)
    const cpRow = await handle.app.db.db
      .select({ craneProfileId: organizationOperators.craneProfileId })
      .from(organizationOperators)
      .where(eq(organizationOperators.id, op.id))
    const cpId = cpRow[0]?.craneProfileId
    if (!cpId) throw new Error('no profile ref')
    const del = handle.app.db.db.execute(sql`DELETE FROM crane_profiles WHERE id = ${cpId}`)
    await expect(del).rejects.toThrow(/violates foreign key/i)
  })

  it('FK ON DELETE RESTRICT: cannot delete user referenced by crane_profile', async () => {
    const op = await createOperationalHire(ownerAToken)
    const userRow = await handle.app.db.db
      .select({ userId: craneProfiles.userId })
      .from(organizationOperators)
      .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
      .where(eq(organizationOperators.id, op.id))
    const userId = userRow[0]?.userId
    if (!userId) throw new Error('no user ref')
    const del = handle.app.db.db.execute(sql`DELETE FROM users WHERE id = ${userId}`)
    await expect(del).rejects.toThrow(/violates foreign key/i)
  })
})
