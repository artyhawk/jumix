import { auditLog, craneProfiles, organizationOperators } from '@jumix/db'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты crane-profiles-модуля (ADR 0003 + authorization.md §4.2b/§4.2c).
 * Покрывают:
 *   - self /me: read/update (любой approval_status + любой hire-статус)
 *   - self /me/memberships (список hire-строк)
 *   - self /me/avatar/* (upload-url → confirm → delete, prefix verify,
 *     content-type / size enforcement, cleanup)
 *   - superadmin list/get/update/delete
 *   - approve/reject workflow (pending → approved/rejected; не-pending → 409;
 *     rejected read-only для update)
 *   - owner cannot use crane-profile surface (B2d-2a: он ходит через operator-модуль)
 *   - unauthenticated → 401
 *
 * Один Postgres-контейнер на весь файл. BIN-серия 64xxxx (не пересекается с
 * 61 organization / 62 crane / 63 operator).
 */

let handle: TestAppHandle

let superadminToken: string
let ownerAToken: string
let orgAId: string

beforeAll(async () => {
  handle = await buildTestApp()

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77140000000',
    organizationId: null,
    name: 'Super',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const orgA = await createOrganization(handle.app, { name: 'CP A', bin: '640000000001' })
  orgAId = orgA.id
  const ownerA = await createUser(handle.app, {
    role: 'owner',
    phone: '+77140000001',
    organizationId: orgAId,
    name: 'Owner A',
  })
  ownerAToken = await signTokenFor(handle.app, ownerA)
}, 60_000)

afterAll(async () => {
  await handle.close()
})

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

let seq = 2000
function nextPhone(): string {
  seq += 1
  return `+7714${String(seq).padStart(7, '0')}`
}

/**
 * Создаёт approved crane_profile + approved hire в orgA через полный pipeline
 * ADR 0003: user → pending profile → profile approve (superadmin) → pending
 * hire (POST /api/v1/organization-operators owner'ом) → hire approve (superadmin).
 * Возвращает hire id + profile id + user id.
 */
async function createApprovedPair(overrides: { firstName?: string } = {}): Promise<{
  operatorId: string
  craneProfileId: string
  userId: string
  phone: string
  iin: string
}> {
  const iinValue = iin(seq * 1000)
  const phoneValue = nextPhone()
  const user = await createUser(handle.app, {
    role: 'operator',
    phone: phoneValue,
    organizationId: orgAId,
    name: overrides.firstName ?? 'Ivan',
  })
  const cpRows = await handle.app.db.db
    .insert(craneProfiles)
    .values({
      userId: user.id,
      firstName: overrides.firstName ?? 'Иван',
      lastName: 'Петров',
      iin: iinValue,
      approvalStatus: 'pending',
    })
    .returning({ id: craneProfiles.id })
  const craneProfileId = cpRows[0]?.id
  if (!craneProfileId) throw new Error('crane_profile insert failed')

  const approveProfile = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/crane-profiles/${craneProfileId}/approve`,
    headers: { authorization: `Bearer ${superadminToken}` },
  })
  if (approveProfile.statusCode !== 200) {
    throw new Error(`profile approve: ${approveProfile.statusCode} ${approveProfile.body}`)
  }

  const hireRes = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/organization-operators',
    headers: { authorization: `Bearer ${ownerAToken}` },
    payload: { craneProfileId },
  })
  if (hireRes.statusCode !== 201) {
    throw new Error(`hire create: ${hireRes.statusCode} ${hireRes.body}`)
  }
  const hire = hireRes.json() as { id: string }

  const approveHire = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/organization-operators/${hire.id}/approve`,
    headers: { authorization: `Bearer ${superadminToken}` },
  })
  if (approveHire.statusCode !== 200) {
    throw new Error(`hire approve: ${approveHire.statusCode} ${approveHire.body}`)
  }

  return {
    operatorId: hire.id,
    craneProfileId,
    userId: user.id,
    phone: phoneValue,
    iin: iinValue,
  }
}

/**
 * Создаёт pending crane_profile напрямую в БД (без hire-строки). Нужен для
 * тестов approve/reject — admin-create в B2d-2a делает approved pair.
 */
async function createPendingProfile(overrides: { iin?: string } = {}): Promise<{
  id: string
  userId: string
  phone: string
  iin: string
}> {
  const phone = nextPhone()
  const user = await createUser(handle.app, {
    role: 'operator',
    phone,
    organizationId: orgAId,
    name: 'Pending',
  })
  const iinValue = overrides.iin ?? iin(seq * 1000 + 7)
  const rows = await handle.app.db.db
    .insert(craneProfiles)
    .values({
      userId: user.id,
      firstName: 'Pend',
      lastName: 'Ing',
      iin: iinValue,
      approvalStatus: 'pending',
    })
    .returning({ id: craneProfiles.id })
  const id = rows[0]?.id
  if (!id) throw new Error('pending profile insert failed')
  return { id, userId: user.id, phone, iin: iinValue }
}

async function tokenForUser(
  userId: string,
  role: 'operator' | 'owner' | 'superadmin',
): Promise<string> {
  return signTokenFor(handle.app, {
    id: userId,
    role,
    organizationId: role === 'owner' ? orgAId : null,
    tokenVersion: 0,
  })
}

async function writeFakeObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const storage = handle.app.storage as unknown as {
    putObjectRaw?: (k: string, b: Buffer, ct: string) => void
  }
  if (typeof storage.putObjectRaw !== 'function') {
    throw new Error('expected InMemoryStorageClient with putObjectRaw; got foreign driver')
  }
  storage.putObjectRaw(key, body, contentType)
}

describe('GET /api/v1/crane-profiles/me', () => {
  it('200: operator reads own approved profile', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(pair.craneProfileId)
    expect(res.json().phone).toContain('*')
    expect(res.json().approvalStatus).toBe('approved')
  })

  it('200: operator blocked-hire can STILL read own profile (identity ортогональна)', async () => {
    const pair = await createApprovedPair()
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${pair.operatorId}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    const token = await tokenForUser(pair.userId, 'operator')
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('200: pending/rejected profile — operator видит свою entry + reason', async () => {
    const pending = await createPendingProfile()
    const token = await tokenForUser(pending.userId, 'operator')
    const pendingRes = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(pendingRes.statusCode).toBe(200)
    expect(pendingRes.json().approvalStatus).toBe('pending')

    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'Документы не читаются' },
    })
    const rejectedRes = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(rejectedRes.statusCode).toBe(200)
    expect(rejectedRes.json().approvalStatus).toBe('rejected')
    expect(rejectedRes.json().rejectionReason).toBe('Документы не читаются')
  })

  it('403: owner cannot access /me (not an operator)', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403: superadmin cannot access /me', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('404: operator user without crane_profile → 404', async () => {
    const lone = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: orgAId,
      name: 'Lone',
    })
    const token = await tokenForUser(lone.id, 'operator')
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('401: unauthenticated rejected', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/api/v1/crane-profiles/me' })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/v1/crane-profiles/me (self update)', () => {
  it('200: operator updates own firstName + audit row', async () => {
    const pair = await createApprovedPair({ firstName: 'Old' })
    const token = await tokenForUser(pair.userId, 'operator')
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { firstName: 'Self-New' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().firstName).toBe('Self-New')

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, pair.craneProfileId),
          eq(auditLog.action, 'crane_profile.self_update'),
        ),
      )
    expect(audits).toHaveLength(1)
  })

  it('200: blocked-hire operator CAN update identity (hire status ≠ identity freeze)', async () => {
    const pair = await createApprovedPair()
    await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organization-operators/${pair.operatorId}/status`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { status: 'blocked' },
    })
    const token = await tokenForUser(pair.userId, 'operator')
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { firstName: 'Blocked-But-Alive' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('422: iin NOT accepted in self-update (admin-only)', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { iin: iin(999_999_999) },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: empty patch rejected', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })

  it('401: unauthenticated', async () => {
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/api/v1/crane-profiles/me',
      payload: { firstName: 'X' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/v1/crane-profiles/me/memberships', () => {
  it('200: operator видит свой hire', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me/memberships',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ id: string; organizationId: string }>
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe(pair.operatorId)
    expect(items[0]?.organizationId).toBe(orgAId)
  })

  it('200: pending-профиль без hire → пустой items', async () => {
    const pending = await createPendingProfile()
    const token = await tokenForUser(pending.userId, 'operator')
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me/memberships',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items).toEqual([])
  })

  it('403: non-operator', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me/memberships',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/v1/crane-profiles (superadmin list)', () => {
  it('200: superadmin видит и approved, и pending', async () => {
    const approved = await createApprovedPair()
    const pending = await createPendingProfile()
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles?limit=100',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const ids = new Set((res.json().items as Array<{ id: string }>).map((i) => i.id))
    expect(ids.has(approved.craneProfileId)).toBe(true)
    expect(ids.has(pending.id)).toBe(true)
  })

  it('200: approvalStatus=pending фильтрует', async () => {
    const pending = await createPendingProfile()
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles?approvalStatus=pending&limit=100',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ id: string; approvalStatus: string }>
    expect(items.every((i) => i.approvalStatus === 'pending')).toBe(true)
    expect(items.some((i) => i.id === pending.id)).toBe(true)
  })

  it('403: owner cannot list crane-profiles', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/v1/crane-profiles/:id/approve', () => {
  it('200: superadmin approves pending → approved + approvedAt', async () => {
    const pending = await createPendingProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().approvalStatus).toBe('approved')
    expect(res.json().approvedAt).toEqual(expect.any(String))
  })

  it('409: already approved → CRANE_PROFILE_NOT_PENDING', async () => {
    const approved = await createApprovedPair()
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${approved.craneProfileId}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_PROFILE_NOT_PENDING')
  })

  it('409: already rejected → CRANE_PROFILE_NOT_PENDING', async () => {
    const pending = await createPendingProfile()
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'fail' },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(409)
  })

  it('403: owner cannot approve (external actor invariant)', async () => {
    const pending = await createPendingProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/approve`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('404: nonexistent uuid', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/00000000-0000-0000-0000-000000000000/approve',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/v1/crane-profiles/:id/reject', () => {
  it('200: superadmin rejects pending + reason', async () => {
    const pending = await createPendingProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'Фальшивые корочки' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().approvalStatus).toBe('rejected')
    expect(res.json().rejectionReason).toBe('Фальшивые корочки')
  })

  it('422: reason required', async () => {
    const pending = await createPendingProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })

  it('409: already rejected', async () => {
    const pending = await createPendingProfile()
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'one' },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'two' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('403: owner cannot reject', async () => {
    const pending = await createPendingProfile()
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/reject`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { reason: 'no' },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('PATCH /api/v1/crane-profiles/:id (superadmin update)', () => {
  it('200: superadmin updates identity', async () => {
    const pair = await createApprovedPair()
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/crane-profiles/${pair.craneProfileId}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { firstName: 'Fixed' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().firstName).toBe('Fixed')
  })

  it('409: rejected profile — read-only (CRANE_PROFILE_REJECTED_READONLY)', async () => {
    const pending = await createPendingProfile()
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'blocked' },
    })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/crane-profiles/${pending.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { firstName: 'Try' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_PROFILE_REJECTED_READONLY')
  })

  it('409: IIN conflict → IIN_ALREADY_EXISTS', async () => {
    const a = await createApprovedPair()
    const b = await createApprovedPair()
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/crane-profiles/${b.craneProfileId}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { iin: a.iin },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('IIN_ALREADY_EXISTS')
  })

  it('404: owner cannot update crane-profile directly (платформа скрывает существование)', async () => {
    // CLAUDE.md §4: 404 вместо 403 для out-of-scope ресурсов. Crane-profile —
    // platform-level, owner не имеет legitimate scope → existence скрыта.
    const pair = await createApprovedPair()
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/crane-profiles/${pair.craneProfileId}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { firstName: 'No' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /api/v1/crane-profiles/:id', () => {
  it('200: superadmin soft-deletes rejected profile', async () => {
    const pending = await createPendingProfile()
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${pending.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'bye' },
    })
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/crane-profiles/${pending.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const rows = await handle.app.db.db
      .select({ deletedAt: craneProfiles.deletedAt })
      .from(craneProfiles)
      .where(eq(craneProfiles.id, pending.id))
    expect(rows[0]?.deletedAt).not.toBeNull()
  })

  it('404: owner cannot delete (platform-level existence hidden)', async () => {
    // CLAUDE.md §4: 404 вместо 403 для out-of-scope.
    const pending = await createPendingProfile()
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/crane-profiles/${pending.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('Avatar flow (/me/avatar/*)', () => {
  it('200: operator requests upload URL → platform-level prefix', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/upload-url',
      headers: { authorization: `Bearer ${token}` },
      payload: { contentType: 'image/jpeg' },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.uploadUrl).toEqual(expect.any(String))
    expect(json.key).toContain(`crane-profiles/${pair.craneProfileId}/avatar/`)
    expect(json.key).toMatch(/\.jpg$/)
  })

  it('200: image/png → .png', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/upload-url',
      headers: { authorization: `Bearer ${token}` },
      payload: { contentType: 'image/png' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().key).toMatch(/\.png$/)
  })

  it('422: unsupported content-type', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/upload-url',
      headers: { authorization: `Bearer ${token}` },
      payload: { contentType: 'image/webp' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('200: full flow — upload → confirm → avatarUrl populated + audit', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')

    const issued = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/upload-url',
      headers: { authorization: `Bearer ${token}` },
      payload: { contentType: 'image/jpeg' },
    })
    const { key } = issued.json() as { key: string }
    await writeFakeObject(key, Buffer.from('x'.repeat(100)), 'image/jpeg')

    const confirm = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { key },
    })
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json().avatarUrl).toEqual(expect.any(String))

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, pair.craneProfileId),
          eq(auditLog.action, 'crane_profile.avatar.set'),
        ),
      )
    expect(audits).toHaveLength(1)
  })

  it('400: confirm rejects key with foreign craneProfileId prefix', async () => {
    const a = await createApprovedPair()
    const b = await createApprovedPair()
    const token = await tokenForUser(a.userId, 'operator')
    const foreignKey = `crane-profiles/${b.craneProfileId}/avatar/1.jpg`
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { key: foreignKey },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('STORAGE_KEY_INVALID')
  })

  it('404: confirm when object not uploaded → OBJECT_NOT_FOUND', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')
    const key = `crane-profiles/${pair.craneProfileId}/avatar/ghost.jpg`
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { key },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('OBJECT_NOT_FOUND')
  })

  it('400: confirm rejects wrong content-type + cleanup', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')
    const key = `crane-profiles/${pair.craneProfileId}/avatar/bad.jpg`
    await writeFakeObject(key, Buffer.from('x'), 'application/octet-stream')
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { key },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('AVATAR_CONTENT_TYPE_INVALID')
    expect(await handle.app.storage.headObject(key)).toBeNull()
  })

  it('400: confirm rejects oversize + cleanup', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')
    const key = `crane-profiles/${pair.craneProfileId}/avatar/huge.jpg`
    await writeFakeObject(key, Buffer.alloc(6 * 1024 * 1024, 1), 'image/jpeg')
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { key },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('AVATAR_TOO_LARGE')
    expect(await handle.app.storage.headObject(key)).toBeNull()
  })

  it('200: second confirm replaces avatarKey + deletes old object', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')

    const key1 = `crane-profiles/${pair.craneProfileId}/avatar/first.jpg`
    await writeFakeObject(key1, Buffer.from('first'), 'image/jpeg')
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { key: key1 },
    })

    const key2 = `crane-profiles/${pair.craneProfileId}/avatar/second.jpg`
    await writeFakeObject(key2, Buffer.from('second'), 'image/jpeg')
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { key: key2 },
    })
    expect(res.statusCode).toBe(200)
    expect(await handle.app.storage.headObject(key1)).toBeNull()
    expect(await handle.app.storage.headObject(key2)).not.toBeNull()
  })

  it('200: DELETE /me/avatar clears key + storage object + audit', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')

    const key = `crane-profiles/${pair.craneProfileId}/avatar/todelete.jpg`
    await writeFakeObject(key, Buffer.from('x'), 'image/jpeg')
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { key },
    })

    const del = await handle.app.inject({
      method: 'DELETE',
      url: '/api/v1/crane-profiles/me/avatar',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(del.statusCode).toBe(200)
    expect(del.json().avatarUrl).toBeNull()
    expect(await handle.app.storage.headObject(key)).toBeNull()

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, pair.craneProfileId),
          eq(auditLog.action, 'crane_profile.avatar.clear'),
        ),
      )
    expect(audits).toHaveLength(1)
  })

  it('200: DELETE /me/avatar no-op when no avatar set', async () => {
    const pair = await createApprovedPair()
    const token = await tokenForUser(pair.userId, 'operator')
    const res = await handle.app.inject({
      method: 'DELETE',
      url: '/api/v1/crane-profiles/me/avatar',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('401: unauthenticated', async () => {
    const res1 = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/upload-url',
      payload: { contentType: 'image/jpeg' },
    })
    expect(res1.statusCode).toBe(401)
    const res2 = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/avatar/confirm',
      payload: { key: 'x' },
    })
    expect(res2.statusCode).toBe(401)
    const res3 = await handle.app.inject({
      method: 'DELETE',
      url: '/api/v1/crane-profiles/me/avatar',
    })
    expect(res3.statusCode).toBe(401)
  })
})

describe('Data layer — organization_operators still link correctly', () => {
  it('createApprovedPair inserts both crane_profile + organization_operator approved', async () => {
    const pair = await createApprovedPair()
    const cpRows = await handle.app.db.db
      .select({ approval: craneProfiles.approvalStatus })
      .from(craneProfiles)
      .where(eq(craneProfiles.id, pair.craneProfileId))
    expect(cpRows[0]?.approval).toBe('approved')

    const ooRows = await handle.app.db.db
      .select({ approval: organizationOperators.approvalStatus })
      .from(organizationOperators)
      .where(eq(organizationOperators.id, pair.operatorId))
    expect(ooRows[0]?.approval).toBe('approved')
  })
})
