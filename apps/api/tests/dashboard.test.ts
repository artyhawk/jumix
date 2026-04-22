import { craneProfiles, cranes, organizationOperators } from '@jumix/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты dashboard-модуля (B3-UI-2). Покрывают:
 *   - 200 superadmin получает типизированный stats-объект (shape контракт)
 *   - 403 owner / operator (policy в service, не в route)
 *   - 401 без токена
 *   - Счётчики совпадают с вставленными фикстурами (8 counters)
 *
 * Один Postgres-контейнер на весь файл. BIN-серия 65xxxx (не пересекается
 * с 60-organization / 61 / 62-crane / 63-operator / 64-crane-profile).
 */

let handle: TestAppHandle

let superadminToken: string
let ownerToken: string
let operatorToken: string

beforeAll(async () => {
  handle = await buildTestApp()

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77150000001',
    organizationId: null,
    name: 'Super',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const orgActive = await createOrganization(handle.app, {
    name: 'Dashboard Org',
    bin: '650000000001',
  })
  const owner = await createUser(handle.app, {
    role: 'owner',
    phone: '+77150000002',
    organizationId: orgActive.id,
    name: 'Owner',
  })
  ownerToken = await signTokenFor(handle.app, owner)

  const operator = await createUser(handle.app, {
    role: 'operator',
    phone: '+77150000003',
    organizationId: null,
    name: 'Operator',
  })
  operatorToken = await signTokenFor(handle.app, operator)
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

let phoneSeq = 3000
function nextPhone(): string {
  phoneSeq += 1
  return `+7715${String(phoneSeq).padStart(7, '0')}`
}

describe('GET /api/v1/dashboard/stats — authorization', () => {
  it('401: no token', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/stats',
    })
    expect(res.statusCode).toBe(401)
  })

  it('403: owner cannot read stats', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/stats',
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('403: operator cannot read stats', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/stats',
      headers: { authorization: `Bearer ${operatorToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('200: superadmin gets typed stats shape', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/stats',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({
      pending: {
        craneProfiles: expect.any(Number),
        organizationOperators: expect.any(Number),
        cranes: expect.any(Number),
      },
      active: {
        organizations: expect.any(Number),
        craneProfiles: expect.any(Number),
        cranes: expect.any(Number),
        memberships: expect.any(Number),
      },
      thisWeek: {
        newRegistrations: expect.any(Number),
      },
    })
  })
})

describe('GET /api/v1/dashboard/stats — counters', () => {
  it('counters reflect inserted fixtures and ignore soft-deleted / retired / inactive', async () => {
    const baseline = await getStats()

    // +1 active organization (total: +1)
    const newOrg = await createOrganization(handle.app, {
      name: 'Counter Org',
      bin: '650000000002',
      status: 'active',
    })

    // +1 suspended organization (total active should NOT change)
    await createOrganization(handle.app, {
      name: 'Suspended Org',
      bin: '650000000003',
      status: 'suspended',
    })

    // crane_profiles: 2 pending (one ancient), 1 approved, 1 soft-deleted
    const now = Date.now()
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000)

    const u1 = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: null,
      name: 'P1',
    })
    const u2 = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: null,
      name: 'P2',
    })
    const u3 = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: null,
      name: 'P3',
    })
    const u4 = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: null,
      name: 'P4',
    })

    // p1: pending, recent → counted in pending + thisWeek
    await handle.app.db.db.insert(craneProfiles).values({
      userId: u1.id,
      firstName: 'A',
      lastName: 'A',
      iin: iinFor(10_000_000),
      approvalStatus: 'pending',
    })
    // p2: pending, old (>7d) → pending yes, thisWeek no
    await handle.app.db.db.insert(craneProfiles).values({
      userId: u2.id,
      firstName: 'B',
      lastName: 'B',
      iin: iinFor(10_000_100),
      approvalStatus: 'pending',
      createdAt: eightDaysAgo,
      updatedAt: eightDaysAgo,
    })
    // p3: approved → active.craneProfiles
    const [p3] = await handle.app.db.db
      .insert(craneProfiles)
      .values({
        userId: u3.id,
        firstName: 'C',
        lastName: 'C',
        iin: iinFor(10_000_200),
        approvalStatus: 'approved',
      })
      .returning({ id: craneProfiles.id })
    // p4: approved but soft-deleted → excluded everywhere
    await handle.app.db.db.insert(craneProfiles).values({
      userId: u4.id,
      firstName: 'D',
      lastName: 'D',
      iin: iinFor(10_000_300),
      approvalStatus: 'approved',
      deletedAt: new Date(),
    })

    // cranes: 1 pending, 1 approved+active, 1 approved+retired (excluded from active)
    await handle.app.db.db.insert(cranes).values({
      organizationId: newOrg.id,
      type: 'tower',
      model: 'M1',
      capacityTon: '5.00',
      approvalStatus: 'pending',
      status: 'active',
    })
    await handle.app.db.db.insert(cranes).values({
      organizationId: newOrg.id,
      type: 'tower',
      model: 'M2',
      capacityTon: '5.00',
      approvalStatus: 'approved',
      status: 'active',
    })
    await handle.app.db.db.insert(cranes).values({
      organizationId: newOrg.id,
      type: 'tower',
      model: 'M3',
      capacityTon: '5.00',
      approvalStatus: 'approved',
      status: 'retired',
    })

    // organization_operators: 1 pending, 1 approved+active, 1 approved+blocked (excluded from active memberships)
    if (!p3?.id) throw new Error('p3 insert failed')
    await handle.app.db.db.insert(organizationOperators).values({
      craneProfileId: p3.id,
      organizationId: newOrg.id,
      approvalStatus: 'pending',
      status: 'active',
    })
    // approved+active: reuse p3, but diff org — need another approved profile
    const u5 = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: null,
      name: 'P5',
    })
    const [p5] = await handle.app.db.db
      .insert(craneProfiles)
      .values({
        userId: u5.id,
        firstName: 'E',
        lastName: 'E',
        iin: iinFor(10_000_400),
        approvalStatus: 'approved',
      })
      .returning({ id: craneProfiles.id })
    if (!p5?.id) throw new Error('p5 insert failed')
    await handle.app.db.db.insert(organizationOperators).values({
      craneProfileId: p5.id,
      organizationId: newOrg.id,
      approvalStatus: 'approved',
      status: 'active',
    })

    const u6 = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: null,
      name: 'P6',
    })
    const [p6] = await handle.app.db.db
      .insert(craneProfiles)
      .values({
        userId: u6.id,
        firstName: 'F',
        lastName: 'F',
        iin: iinFor(10_000_500),
        approvalStatus: 'approved',
      })
      .returning({ id: craneProfiles.id })
    if (!p6?.id) throw new Error('p6 insert failed')
    await handle.app.db.db.insert(organizationOperators).values({
      craneProfileId: p6.id,
      organizationId: newOrg.id,
      approvalStatus: 'approved',
      status: 'blocked',
    })

    const after = await getStats()

    // Active organizations: +1 (suspended one excluded)
    expect(after.active.organizations).toBe(baseline.active.organizations + 1)

    // Pending crane_profiles: +2 (soft-deleted excluded)
    expect(after.pending.craneProfiles).toBe(baseline.pending.craneProfiles + 2)
    // Active (approved, non-deleted) crane_profiles: +3 (p3, p5, p6; p4 soft-deleted excluded)
    expect(after.active.craneProfiles).toBe(baseline.active.craneProfiles + 3)
    // thisWeek: +3 recent profiles (p3/p5/p6/p1 are recent; p4 is recent too but soft-deleted excluded; p2 is 8d old excluded) → +4
    expect(after.thisWeek.newRegistrations).toBe(baseline.thisWeek.newRegistrations + 4)

    // Pending cranes: +1
    expect(after.pending.cranes).toBe(baseline.pending.cranes + 1)
    // Active cranes: +1 (approved+active; retired excluded)
    expect(after.active.cranes).toBe(baseline.active.cranes + 1)

    // Pending memberships: +1
    expect(after.pending.organizationOperators).toBe(baseline.pending.organizationOperators + 1)
    // Active memberships: +1 (approved+active; blocked excluded)
    expect(after.active.memberships).toBe(baseline.active.memberships + 1)
  })
})

async function getStats(): Promise<{
  pending: { craneProfiles: number; organizationOperators: number; cranes: number }
  active: { organizations: number; craneProfiles: number; cranes: number; memberships: number }
  thisWeek: { newRegistrations: number }
}> {
  const res = await handle.app.inject({
    method: 'GET',
    url: '/api/v1/dashboard/stats',
    headers: { authorization: `Bearer ${superadminToken}` },
  })
  expect(res.statusCode).toBe(200)
  return res.json()
}
