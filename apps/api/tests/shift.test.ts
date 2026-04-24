import { auditLog, craneProfiles, organizationOperators, shifts } from '@jumix/db'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты shifts-модуля (M4, ADR 0006).
 *
 * Покрытие:
 *   - authz matrix (operator-owner / owner-org / superadmin / foreign / 401)
 *   - start: happy path, canWork-gates (profile pending, rejected, no hire,
 *     license missing/expired), crane eligibility (not approved / retired /
 *     unassigned / foreign org / already in shift)
 *   - state machine: pause/resume/end happy + invalid transitions
 *   - pause time accounting: resume добавляет `now - paused_at` к total
 *   - end during pause: auto-resume accounting
 *   - duplicate active shift → 409 (service + DB partial UNIQUE)
 *   - available-cranes: includes eligible / excludes unassigned / excludes
 *     unapproved / excludes site.status≠active / excludes busy-cranes
 *   - list authz: operator=self / owner=org / superadmin=all
 *   - audit trail: shift.{start,pause,resume,end}
 *
 * BIN-серия 67xxxx (не пересекается с 60-66/68).
 */

let handle: TestAppHandle

let superadminToken: string
let ownerAToken: string
let ownerBToken: string
let orgAId: string
let orgBId: string

const ASTANA_LAT = 51.128722
const ASTANA_LNG = 71.430603

beforeAll(async () => {
  handle = await buildTestApp()

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77170000001',
    organizationId: null,
    name: 'SA',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const orgA = await createOrganization(handle.app, { name: 'Shifts A', bin: '670000000001' })
  orgAId = orgA.id
  const ownerA = await createUser(handle.app, {
    role: 'owner',
    phone: '+77170000002',
    organizationId: orgAId,
    name: 'Owner A',
  })
  ownerAToken = await signTokenFor(handle.app, ownerA)

  const orgB = await createOrganization(handle.app, { name: 'Shifts B', bin: '670000000002' })
  orgBId = orgB.id
  const ownerB = await createUser(handle.app, {
    role: 'owner',
    phone: '+77170000003',
    organizationId: orgBId,
    name: 'Owner B',
  })
  ownerBToken = await signTokenFor(handle.app, ownerB)
}, 60_000)

afterAll(async () => {
  await handle.close()
})

/** Детерминированный 12-digit IIN с корректной чексуммой. */
function iinFor(seed: number): string {
  let base = seed
  while (true) {
    const padded = String(base).padStart(11, '0')
    const digits = Array.from(padded, (c) => Number.parseInt(c, 10))
    const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]
    const weighted = (w: number[]) => w.reduce((acc, x, i) => acc + (digits[i] ?? 0) * x, 0)
    let check = weighted(w1) % 11
    if (check === 10) {
      check = weighted(w2) % 11
      if (check === 10) {
        base += 1
        continue
      }
    }
    return padded + String(check)
  }
}

let phoneSeq = 1000
function nextPhone(): string {
  phoneSeq += 1
  return `+7717${String(phoneSeq).padStart(7, '0')}`
}

let iinSeq = 70_000
function nextIin(): string {
  iinSeq += 1
  return iinFor(iinSeq)
}

function futureDate(daysFromNow: number): Date {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
}
function pastDate(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
}

async function createSite(token: string, name: string): Promise<{ id: string }> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/sites',
    headers: { authorization: `Bearer ${token}` },
    payload: { name, latitude: ASTANA_LAT, longitude: ASTANA_LNG, radiusM: 200 },
  })
  if (res.statusCode !== 201) throw new Error(`site create failed: ${res.statusCode} ${res.body}`)
  return { id: res.json().id }
}

async function createApprovedCrane(
  ownerToken: string,
  siteId: string | null,
  model: string,
): Promise<{ id: string; organizationId: string; siteId: string | null }> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/cranes',
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: {
      type: 'tower',
      model,
      capacityTon: 12.5,
      ...(siteId ? { siteId } : {}),
    },
  })
  if (res.statusCode !== 201) throw new Error(`crane create failed: ${res.statusCode} ${res.body}`)
  const crane = res.json()
  const approve = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/cranes/${crane.id}/approve`,
    headers: { authorization: `Bearer ${superadminToken}` },
  })
  if (approve.statusCode !== 200) {
    throw new Error(`approve failed: ${approve.statusCode} ${approve.body}`)
  }
  return { id: crane.id, organizationId: crane.organizationId, siteId: crane.siteId }
}

type OperatorFixture = {
  userId: string
  profileId: string
  token: string
}

async function createEmployedOperator(options: {
  organizationId: string
  profileApproval?: 'pending' | 'approved' | 'rejected'
  hireApproval?: 'pending' | 'approved' | 'rejected'
  hireStatus?: 'active' | 'blocked' | 'terminated'
  licenseExpiresAt?: Date | null
  name?: string
}): Promise<OperatorFixture> {
  const profileApproval = options.profileApproval ?? 'approved'
  const hireApproval = options.hireApproval ?? 'approved'
  const hireStatus = options.hireStatus ?? 'active'

  const user = await createUser(handle.app, {
    role: 'operator',
    phone: nextPhone(),
    organizationId: null,
    name: options.name ?? 'Op',
  })
  type ProfileInsert = {
    userId: string
    firstName: string
    lastName: string
    iin: string
    specialization: Record<string, unknown>
    approvalStatus: 'pending' | 'approved' | 'rejected'
    approvedAt?: Date | null
    rejectedAt?: Date | null
    rejectionReason?: string | null
    licenseKey?: string | null
    licenseExpiresAt?: Date | null
    licenseVersion?: number
  }
  const values: ProfileInsert = {
    userId: user.id,
    firstName: options.name ?? 'Op',
    lastName: 'Erator',
    iin: nextIin(),
    specialization: {},
    approvalStatus: profileApproval,
  }
  if (profileApproval === 'approved') values.approvedAt = new Date()
  if (profileApproval === 'rejected') {
    values.rejectedAt = new Date()
    values.rejectionReason = 'Документы неполные'
  }
  // License: по умолчанию выдан на год вперёд (valid) — чтобы canWork не
  // падал из-за лицензии, если тест не интересуется ею. Передача null
  // отключает загрузку — будет missing.
  const license = options.licenseExpiresAt
  if (license !== null) {
    values.licenseKey = 'crane-profiles/fake/license/v1/test.pdf'
    values.licenseExpiresAt = license ?? futureDate(365)
    values.licenseVersion = 1
  }

  const inserted = await handle.app.db.db.insert(craneProfiles).values(values).returning()
  const profile = inserted[0]
  if (!profile) throw new Error('crane_profile insert failed')

  await handle.app.db.db.insert(organizationOperators).values({
    craneProfileId: profile.id,
    organizationId: options.organizationId,
    approvalStatus: hireApproval,
    status: hireStatus,
    approvedAt: hireApproval === 'approved' ? new Date() : null,
    rejectedAt: hireApproval === 'rejected' ? new Date() : null,
    rejectionReason: hireApproval === 'rejected' ? 'org отклонил' : null,
  })

  const token = await signTokenFor(handle.app, user)
  return { userId: user.id, profileId: profile.id, token }
}

describe('POST /api/v1/shifts/start — happy path', () => {
  it('201: approved operator with valid license starts shift on approved+active+assigned crane', async () => {
    const site = await createSite(ownerAToken, 'Site-H1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'H1')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'H1' })

    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane.id },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toEqual(expect.any(String))
    expect(body.status).toBe('active')
    expect(body.craneId).toBe(crane.id)
    expect(body.operatorId).toBe(op.userId)
    expect(body.organizationId).toBe(orgAId)
    expect(body.siteId).toBe(site.id)
    expect(body.endedAt).toBeNull()
    expect(body.pausedAt).toBeNull()
    expect(body.totalPauseSeconds).toBe(0)
    expect(body.crane.model).toBe('H1')
    expect(body.site.id).toBe(site.id)

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, body.id), eq(auditLog.action, 'shift.start')))
    expect(audits).toHaveLength(1)
  })
})

describe('POST /api/v1/shifts/start — canWork gate', () => {
  it('422 CANNOT_START_SHIFT: pending profile', async () => {
    const site = await createSite(ownerAToken, 'Site-CW1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'CW1')
    const op = await createEmployedOperator({
      organizationId: orgAId,
      profileApproval: 'pending',
      name: 'CW1',
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane.id },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('CANNOT_START_SHIFT')
  })

  it('422 CANNOT_START_SHIFT: rejected profile', async () => {
    const site = await createSite(ownerAToken, 'Site-CW2')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'CW2')
    const op = await createEmployedOperator({
      organizationId: orgAId,
      profileApproval: 'rejected',
      name: 'CW2',
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane.id },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422 CANNOT_START_SHIFT: no approved hire (pending)', async () => {
    const site = await createSite(ownerAToken, 'Site-CW3')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'CW3')
    const op = await createEmployedOperator({
      organizationId: orgAId,
      hireApproval: 'pending',
      name: 'CW3',
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane.id },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422 CANNOT_START_SHIFT: license missing', async () => {
    const site = await createSite(ownerAToken, 'Site-CW4')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'CW4')
    const op = await createEmployedOperator({
      organizationId: orgAId,
      licenseExpiresAt: null,
      name: 'CW4',
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane.id },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('CANNOT_START_SHIFT')
    expect(res.json().error.details.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('Удостоверение')]),
    )
  })

  it('422 CANNOT_START_SHIFT: license expired', async () => {
    const site = await createSite(ownerAToken, 'Site-CW5')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'CW5')
    const op = await createEmployedOperator({
      organizationId: orgAId,
      licenseExpiresAt: pastDate(1),
      name: 'CW5',
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane.id },
    })
    expect(res.statusCode).toBe(422)
  })
})

describe('POST /api/v1/shifts/start — crane eligibility', () => {
  it('404 CRANE_NOT_FOUND: crane в чужой организации (operator не нанят)', async () => {
    const siteB = await createSite(ownerBToken, 'Site-Foreign')
    const craneB = await createApprovedCrane(ownerBToken, siteB.id, 'ForeignCrane')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'Cross' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: craneB.id },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('CRANE_NOT_FOUND')
  })

  it('404 CRANE_NOT_FOUND: crane не assigned (siteId null)', async () => {
    const crane = await createApprovedCrane(ownerAToken, null, 'Unassigned')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'NoSite' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane.id },
    })
    expect(res.statusCode).toBe(404)
  })

  it('404 CRANE_NOT_FOUND: crane pending approval', async () => {
    const site = await createSite(ownerAToken, 'Site-Pending')
    const createRes = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { type: 'tower', model: 'Pending', capacityTon: 10, siteId: site.id },
    })
    expect(createRes.statusCode).toBe(201)
    const pendingCraneId = createRes.json().id
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'Pend' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: pendingCraneId },
    })
    expect(res.statusCode).toBe(404)
  })

  it('409 CRANE_ALREADY_IN_SHIFT: crane уже в живой смене другого оператора', async () => {
    const site = await createSite(ownerAToken, 'Site-Busy')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'Busy')
    const op1 = await createEmployedOperator({ organizationId: orgAId, name: 'Op1' })
    const op2 = await createEmployedOperator({ organizationId: orgAId, name: 'Op2' })
    // op1 начал
    const r1 = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op1.token}` },
      payload: { craneId: crane.id },
    })
    expect(r1.statusCode).toBe(201)
    // op2 пытается тот же кран
    const r2 = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op2.token}` },
      payload: { craneId: crane.id },
    })
    expect(r2.statusCode).toBe(409)
    expect(r2.json().error.code).toBe('CRANE_ALREADY_IN_SHIFT')
  })
})

describe('POST /api/v1/shifts/start — duplicate guard', () => {
  it('409 SHIFT_ALREADY_ACTIVE: operator уже в смене', async () => {
    const site1 = await createSite(ownerAToken, 'Site-Dup1')
    const crane1 = await createApprovedCrane(ownerAToken, site1.id, 'Dup1')
    const site2 = await createSite(ownerAToken, 'Site-Dup2')
    const crane2 = await createApprovedCrane(ownerAToken, site2.id, 'Dup2')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'Dup' })

    const r1 = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane1.id },
    })
    expect(r1.statusCode).toBe(201)

    const r2 = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane2.id },
    })
    expect(r2.statusCode).toBe(409)
    expect(r2.json().error.code).toBe('SHIFT_ALREADY_ACTIVE')
  })
})

describe('Shift state machine: pause / resume / end', () => {
  async function startShift(op: OperatorFixture, craneId: string): Promise<string> {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId },
    })
    if (res.statusCode !== 201) throw new Error(`start failed ${res.statusCode} ${res.body}`)
    return res.json().id
  }

  it('pause: active → paused, audit shift.pause, pausedAt set', async () => {
    const site = await createSite(ownerAToken, 'Site-SM1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'SM1')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'SM1' })
    const id = await startShift(op, crane.id)

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${id}/pause`,
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('paused')
    expect(body.pausedAt).toEqual(expect.any(String))

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, id), eq(auditLog.action, 'shift.pause')))
    expect(audits).toHaveLength(1)
  })

  it('resume: paused → active, pausedAt cleared, totalPauseSeconds accrued', async () => {
    const site = await createSite(ownerAToken, 'Site-SM2')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'SM2')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'SM2' })
    const id = await startShift(op, crane.id)

    // Симулируем паузу "в прошлом" установкой paused_at напрямую — даёт
    // контролируемую длительность, которая потом аккумулируется в total.
    await handle.app.db.db
      .update(shifts)
      .set({ status: 'paused', pausedAt: pastDate(1 / 48) }) // 30 мин назад
      .where(eq(shifts.id, id))

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${id}/resume`,
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('active')
    expect(body.pausedAt).toBeNull()
    // 30 минут ≈ 1800s. Allow drift ±20s.
    expect(body.totalPauseSeconds).toBeGreaterThan(1800 - 20)
    expect(body.totalPauseSeconds).toBeLessThan(1800 + 20)
  })

  it('end active → ended with audit shift.end, no pause accounting', async () => {
    const site = await createSite(ownerAToken, 'Site-SM3')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'SM3')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'SM3' })
    const id = await startShift(op, crane.id)

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${id}/end`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: { notes: 'finished' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ended')
    expect(body.endedAt).toEqual(expect.any(String))
    expect(body.pausedAt).toBeNull()
    expect(body.totalPauseSeconds).toBe(0)
    expect(body.notes).toBe('finished')
  })

  it('end paused → ended: auto-resume adds current pause duration to total', async () => {
    const site = await createSite(ownerAToken, 'Site-SM4')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'SM4')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'SM4' })
    const id = await startShift(op, crane.id)

    await handle.app.db.db
      .update(shifts)
      .set({ status: 'paused', pausedAt: pastDate(1 / 24) }) // 1 час
      .where(eq(shifts.id, id))

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${id}/end`,
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ended')
    // 1 час ≈ 3600s
    expect(body.totalPauseSeconds).toBeGreaterThan(3600 - 30)
    expect(body.totalPauseSeconds).toBeLessThan(3600 + 30)
  })

  it('pause: ended shift → 409 INVALID_SHIFT_TRANSITION', async () => {
    const site = await createSite(ownerAToken, 'Site-SM5')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'SM5')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'SM5' })
    const id = await startShift(op, crane.id)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${id}/end`,
      headers: { authorization: `Bearer ${op.token}` },
    })

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${id}/pause`,
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('INVALID_SHIFT_TRANSITION')
  })

  it('end ended → 409 SHIFT_ALREADY_ENDED', async () => {
    const site = await createSite(ownerAToken, 'Site-SM6')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'SM6')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'SM6' })
    const id = await startShift(op, crane.id)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${id}/end`,
      headers: { authorization: `Bearer ${op.token}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${id}/end`,
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('SHIFT_ALREADY_ENDED')
  })

  it('pause already-paused → idempotent 200', async () => {
    const site = await createSite(ownerAToken, 'Site-SM7')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'SM7')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'SM7' })
    const id = await startShift(op, crane.id)
    const r1 = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${id}/pause`,
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(r1.statusCode).toBe(200)
    const r2 = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${id}/pause`,
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(r2.statusCode).toBe(200)
  })
})

describe('Shift authz & scoping', () => {
  async function startShiftHelper(op: OperatorFixture, craneId: string): Promise<string> {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId },
    })
    if (res.statusCode !== 201) throw new Error(`start ${res.statusCode} ${res.body}`)
    return res.json().id
  }

  it('403: owner cannot end someone else shift', async () => {
    const site = await createSite(ownerAToken, 'Site-AZ1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'AZ1')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'AZ1' })
    const id = await startShiftHelper(op, crane.id)
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${id}/end`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('404: operator видит только свои shift-ы (foreign — SHIFT_NOT_FOUND)', async () => {
    const site = await createSite(ownerAToken, 'Site-AZ2')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'AZ2')
    const op1 = await createEmployedOperator({ organizationId: orgAId, name: 'AZ2-1' })
    const op2 = await createEmployedOperator({ organizationId: orgAId, name: 'AZ2-2' })
    const id = await startShiftHelper(op1, crane.id)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/shifts/${id}`,
      headers: { authorization: `Bearer ${op2.token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('200: owner reads shift своей org', async () => {
    const site = await createSite(ownerAToken, 'Site-AZ3')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'AZ3')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'AZ3' })
    const id = await startShiftHelper(op, crane.id)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/shifts/${id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(id)
  })

  it('404: owner B видит 404 на shift org A', async () => {
    const site = await createSite(ownerAToken, 'Site-AZ4')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'AZ4')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'AZ4' })
    const id = await startShiftHelper(op, crane.id)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/shifts/${id}`,
      headers: { authorization: `Bearer ${ownerBToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('200: superadmin читает любые shift-ы', async () => {
    const site = await createSite(ownerAToken, 'Site-AZ5')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'AZ5')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'AZ5' })
    const id = await startShiftHelper(op, crane.id)
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/shifts/${id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('401: no token', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/api/v1/shifts/my/active' })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/v1/shifts/my/active', () => {
  it('returns null when no live shift', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'NoLive' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/my/active',
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toBeNull()
  })

  it('returns current shift with relations when live', async () => {
    const site = await createSite(ownerAToken, 'Site-My1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'My1')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'My1' })
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane.id },
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/my/active',
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.craneId).toBe(crane.id)
    expect(body.crane.model).toBe('My1')
    expect(body.site.id).toBe(site.id)
  })
})

describe('GET /api/v1/shifts/available-cranes', () => {
  it('includes approved+active+assigned cranes в org, где operator approved+active', async () => {
    const site = await createSite(ownerAToken, 'Site-Avail1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'Avail1')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'Avail1' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/available-cranes',
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ id: string; site: { id: string } }>
    const found = items.find((c) => c.id === crane.id)
    expect(found).toBeDefined()
    expect(found?.site.id).toBe(site.id)
  })

  it('excludes unassigned cranes', async () => {
    const unassigned = await createApprovedCrane(ownerAToken, null, 'Unassigned-Avail')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'Avail2' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/available-cranes',
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ id: string }>
    expect(items.find((c) => c.id === unassigned.id)).toBeUndefined()
  })

  it('excludes pending (unapproved) cranes', async () => {
    const site = await createSite(ownerAToken, 'Site-AvailP')
    const createRes = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { type: 'tower', model: 'PendingAvail', capacityTon: 10, siteId: site.id },
    })
    const pendingId = createRes.json().id
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'Avail3' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/available-cranes',
      headers: { authorization: `Bearer ${op.token}` },
    })
    const items = res.json().items as Array<{ id: string }>
    expect(items.find((c) => c.id === pendingId)).toBeUndefined()
  })

  it('excludes cranes уже в живой смене', async () => {
    const site = await createSite(ownerAToken, 'Site-AvailBusy')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'AvailBusy')
    const op1 = await createEmployedOperator({ organizationId: orgAId, name: 'Busy1' })
    const op2 = await createEmployedOperator({ organizationId: orgAId, name: 'Busy2' })
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op1.token}` },
      payload: { craneId: crane.id },
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/available-cranes',
      headers: { authorization: `Bearer ${op2.token}` },
    })
    const items = res.json().items as Array<{ id: string }>
    expect(items.find((c) => c.id === crane.id)).toBeUndefined()
  })

  it('403: owner cannot list available-cranes', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/available-cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/v1/shifts/owner — list for org', () => {
  it('owner видит только свои org shift-ы; superadmin видит всё', async () => {
    const siteA = await createSite(ownerAToken, 'Site-ListA')
    const craneA = await createApprovedCrane(ownerAToken, siteA.id, 'ListA')
    const opA = await createEmployedOperator({ organizationId: orgAId, name: 'ListA' })
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${opA.token}` },
      payload: { craneId: craneA.id },
    })

    const siteB = await createSite(ownerBToken, 'Site-ListB')
    const craneB = await createApprovedCrane(ownerBToken, siteB.id, 'ListB')
    const opB = await createEmployedOperator({ organizationId: orgBId, name: 'ListB' })
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${opB.token}` },
      payload: { craneId: craneB.id },
    })

    const resA = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/owner',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(resA.statusCode).toBe(200)
    const itemsA = resA.json().items as Array<{ organizationId: string }>
    expect(itemsA.every((s) => s.organizationId === orgAId)).toBe(true)

    const resSA = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/owner',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(resSA.statusCode).toBe(200)
    const itemsSA = resSA.json().items as Array<{ organizationId: string }>
    const orgIds = new Set(itemsSA.map((s) => s.organizationId))
    expect(orgIds.size).toBeGreaterThanOrEqual(2)
  })

  it('filter siteId: owner получает только shift-ы на этом site', async () => {
    const siteX = await createSite(ownerAToken, 'Site-FX')
    const siteY = await createSite(ownerAToken, 'Site-FY')
    const craneX = await createApprovedCrane(ownerAToken, siteX.id, 'FX')
    const craneY = await createApprovedCrane(ownerAToken, siteY.id, 'FY')
    const opX = await createEmployedOperator({ organizationId: orgAId, name: 'FX' })
    const opY = await createEmployedOperator({ organizationId: orgAId, name: 'FY' })
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${opX.token}` },
      payload: { craneId: craneX.id },
    })
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${opY.token}` },
      payload: { craneId: craneY.id },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/shifts/owner?siteId=${siteX.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ siteId: string }>
    expect(items.every((s) => s.siteId === siteX.id)).toBe(true)
  })

  it('403: operator cannot use /owner', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'NoOwner' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/owner',
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/v1/shifts/my — history', () => {
  it('paginated DESC, operator видит только свои', async () => {
    const site = await createSite(ownerAToken, 'Site-Hist')
    const crane1 = await createApprovedCrane(ownerAToken, site.id, 'Hist1')
    const crane2 = await createApprovedCrane(ownerAToken, site.id, 'Hist2')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'Hist' })
    // Две закрытые смены на разных кранах
    const r1 = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane1.id },
    })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${r1.json().id}/end`,
      headers: { authorization: `Bearer ${op.token}` },
    })
    const r2 = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane2.id },
    })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${r2.json().id}/end`,
      headers: { authorization: `Bearer ${op.token}` },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/my?limit=10',
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ id: string; operatorId: string }>
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items.every((s) => s.operatorId === op.userId)).toBe(true)
  })

  it('403: owner cannot use /my', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/my',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
