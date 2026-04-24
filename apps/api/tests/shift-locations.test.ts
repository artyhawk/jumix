import {
  auditLog,
  craneProfiles,
  organizationOperators,
  shiftLocationPings,
  shifts,
} from '@jumix/db'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты location pings / latest locations / path / geofence
 * audit transitions (M5, ADR 0007).
 *
 * Покрытие:
 *   - POST /shifts/:id/pings — happy batch, partial reject (future/invalid ts),
 *     ended-shift 422, authz cross-operator 403, cross-org 404, empty/>100
 *     validation, audit geofence_exit/geofence_entry на state change
 *   - GET /shifts/owner/locations-latest — latest per active shift only,
 *     scope owner=org, siteId filter, superadmin=all
 *   - GET /shifts/:id/path — ASC order, sampleRate downsample, authz
 *   - GET /shifts/my/active/location — own latest ping, null если нет pings
 *
 * BIN-серия 68xxxx (не пересекается с 60-67).
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
    phone: '+77180000001',
    organizationId: null,
    name: 'SA-L',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const orgA = await createOrganization(handle.app, { name: 'Locations A', bin: '680000000001' })
  orgAId = orgA.id
  const ownerA = await createUser(handle.app, {
    role: 'owner',
    phone: '+77180000002',
    organizationId: orgAId,
    name: 'Owner A-L',
  })
  ownerAToken = await signTokenFor(handle.app, ownerA)

  const orgB = await createOrganization(handle.app, { name: 'Locations B', bin: '680000000002' })
  orgBId = orgB.id
  const ownerB = await createUser(handle.app, {
    role: 'owner',
    phone: '+77180000003',
    organizationId: orgBId,
    name: 'Owner B-L',
  })
  ownerBToken = await signTokenFor(handle.app, ownerB)
}, 60_000)

afterAll(async () => {
  await handle.close()
})

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

let phoneSeq = 2000
function nextPhone(): string {
  phoneSeq += 1
  return `+7718${String(phoneSeq).padStart(7, '0')}`
}

let iinSeq = 80_000
const usedIins = new Set<string>()
function nextIin(): string {
  // iinFor может skip invalid-checksum seeds — нужен dedup чтобы следующий
  // вызов с `seed+1` не вернул тот же IIN что предыдущий со `seed`.
  while (true) {
    iinSeq += 1
    const iin = iinFor(iinSeq)
    if (!usedIins.has(iin)) {
      usedIins.add(iin)
      return iin
    }
  }
}

function futureDate(daysFromNow: number): Date {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
}

async function createSite(token: string, name: string): Promise<{ id: string }> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/sites',
    headers: { authorization: `Bearer ${token}` },
    payload: { name, latitude: ASTANA_LAT, longitude: ASTANA_LNG, radiusM: 200 },
  })
  if (res.statusCode !== 201) throw new Error(`site create: ${res.statusCode} ${res.body}`)
  return { id: res.json().id }
}

async function createApprovedCrane(
  ownerToken: string,
  siteId: string,
  model: string,
): Promise<{ id: string; siteId: string }> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/cranes',
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { type: 'tower', model, capacityTon: 10, siteId },
  })
  if (res.statusCode !== 201) throw new Error(`crane create: ${res.statusCode} ${res.body}`)
  const crane = res.json()
  const approve = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/cranes/${crane.id}/approve`,
    headers: { authorization: `Bearer ${superadminToken}` },
  })
  if (approve.statusCode !== 200) throw new Error(`approve: ${approve.body}`)
  return { id: crane.id, siteId: crane.siteId }
}

type OperatorFixture = { userId: string; profileId: string; token: string }

async function createEmployedOperator(options: {
  organizationId: string
  name?: string
}): Promise<OperatorFixture> {
  const user = await createUser(handle.app, {
    role: 'operator',
    phone: nextPhone(),
    organizationId: null,
    name: options.name ?? 'L-Op',
  })
  const inserted = await handle.app.db.db
    .insert(craneProfiles)
    .values({
      userId: user.id,
      firstName: options.name ?? 'L',
      lastName: 'Op',
      iin: nextIin(),
      specialization: {},
      approvalStatus: 'approved',
      approvedAt: new Date(),
      licenseKey: 'crane-profiles/fake/license/v1/test.pdf',
      licenseExpiresAt: futureDate(365),
      licenseVersion: 1,
    })
    .returning()
  const profile = inserted[0]
  if (!profile) throw new Error('profile insert failed')

  await handle.app.db.db.insert(organizationOperators).values({
    craneProfileId: profile.id,
    organizationId: options.organizationId,
    approvalStatus: 'approved',
    status: 'active',
    approvedAt: new Date(),
  })

  const token = await signTokenFor(handle.app, user)
  return { userId: user.id, profileId: profile.id, token }
}

async function startShift(op: OperatorFixture, craneId: string): Promise<string> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/shifts/start',
    headers: { authorization: `Bearer ${op.token}` },
    payload: { craneId },
  })
  if (res.statusCode !== 201) throw new Error(`start: ${res.statusCode} ${res.body}`)
  return res.json().id
}

function nowIso(offsetSec = 0): string {
  return new Date(Date.now() + offsetSec * 1000).toISOString()
}

describe('POST /api/v1/shifts/:id/pings — happy path', () => {
  it('201: accepts valid batch, inserts rows, returns counters', async () => {
    const site = await createSite(ownerAToken, 'Site-PH1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'PH1')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'PH1' })
    const shiftId = await startShift(op, crane.id)

    const payload = {
      pings: [
        {
          latitude: 51.128,
          longitude: 71.43,
          accuracyMeters: 12.5,
          recordedAt: nowIso(-30),
          insideGeofence: true,
        },
        {
          latitude: 51.129,
          longitude: 71.431,
          accuracyMeters: 10,
          recordedAt: nowIso(-10),
          insideGeofence: true,
        },
      ],
    }
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.accepted).toBe(2)
    expect(body.rejected).toEqual([])

    const rows = await handle.app.db.db
      .select()
      .from(shiftLocationPings)
      .where(eq(shiftLocationPings.shiftId, shiftId))
    expect(rows).toHaveLength(2)
  })
})

describe('POST /api/v1/shifts/:id/pings — validation & partial reject', () => {
  it('422 VALIDATION_ERROR: empty pings array', async () => {
    const site = await createSite(ownerAToken, 'Site-VL1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'VL1')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'VL1' })
    const shiftId = await startShift(op, crane.id)

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: { pings: [] },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('422 VALIDATION_ERROR: >100 pings in batch', async () => {
    const site = await createSite(ownerAToken, 'Site-VL2')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'VL2')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'VL2' })
    const shiftId = await startShift(op, crane.id)

    const pings = Array.from({ length: 101 }, (_, i) => ({
      latitude: 51.13,
      longitude: 71.43,
      accuracyMeters: 10,
      recordedAt: nowIso(-(101 - i) * 10),
      insideGeofence: true,
    }))
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: { pings },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422 VALIDATION_ERROR: latitude out of range', async () => {
    const site = await createSite(ownerAToken, 'Site-VL3')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'VL3')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'VL3' })
    const shiftId = await startShift(op, crane.id)

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 200,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(),
            insideGeofence: true,
          },
        ],
      },
    })
    expect(res.statusCode).toBe(422)
  })

  it('200 partial reject: future timestamp → reason FUTURE_TIMESTAMP, valid inserted', async () => {
    const site = await createSite(ownerAToken, 'Site-VL4')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'VL4')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'VL4' })
    const shiftId = await startShift(op, crane.id)

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.13,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(-5),
            insideGeofence: true,
          },
          {
            // 10 минут в будущем — за tolerance (5 min)
            latitude: 51.131,
            longitude: 71.431,
            accuracyMeters: 10,
            recordedAt: nowIso(600),
            insideGeofence: true,
          },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.accepted).toBe(1)
    expect(body.rejected).toEqual([{ index: 1, reason: 'FUTURE_TIMESTAMP' }])
  })
})

describe('POST /api/v1/shifts/:id/pings — authz & state', () => {
  it("404 SHIFT_NOT_FOUND: another operator's shift", async () => {
    const site = await createSite(ownerAToken, 'Site-AZ1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'AZ1')
    const op1 = await createEmployedOperator({ organizationId: orgAId, name: 'AZ1-1' })
    const op2 = await createEmployedOperator({ organizationId: orgAId, name: 'AZ1-2' })
    const shiftId = await startShift(op1, crane.id)

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op2.token}` },
      payload: {
        pings: [
          {
            latitude: 51.13,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(),
            insideGeofence: true,
          },
        ],
      },
    })
    expect(res.statusCode).toBe(404)
  })

  it("403 FORBIDDEN: owner cannot ingest pings for operator's shift", async () => {
    const site = await createSite(ownerAToken, 'Site-AZ2')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'AZ2')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'AZ2' })
    const shiftId = await startShift(op, crane.id)

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        pings: [
          {
            latitude: 51.13,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(),
            insideGeofence: true,
          },
        ],
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('422 SHIFT_ENDED: cannot ingest pings after shift ended', async () => {
    const site = await createSite(ownerAToken, 'Site-AZ3')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'AZ3')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'AZ3' })
    const shiftId = await startShift(op, crane.id)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/end`,
      headers: { authorization: `Bearer ${op.token}` },
    })

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.13,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(),
            insideGeofence: true,
          },
        ],
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('SHIFT_ENDED')
  })

  it('200: paused shift accepts pings (pause = advisory, GPS continues)', async () => {
    const site = await createSite(ownerAToken, 'Site-AZ4')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'AZ4')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'AZ4' })
    const shiftId = await startShift(op, crane.id)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pause`,
      headers: { authorization: `Bearer ${op.token}` },
    })

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.13,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(),
            insideGeofence: true,
          },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().accepted).toBe(1)
  })
})

describe('POST /api/v1/shifts/:id/pings — geofence transition audit', () => {
  it('writes shift.geofence_exit when inside → outside', async () => {
    const site = await createSite(ownerAToken, 'Site-GF1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'GF1')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'GF1' })
    const shiftId = await startShift(op, crane.id)

    // First batch — inside
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.128,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(-60),
            insideGeofence: true,
          },
        ],
      },
    })

    // Second batch — outside
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.5,
            longitude: 72.0,
            accuracyMeters: 10,
            recordedAt: nowIso(-30),
            insideGeofence: false,
          },
        ],
      },
    })

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, shiftId), eq(auditLog.action, 'shift.geofence_exit')))
    expect(audits).toHaveLength(1)
  })

  it('writes shift.geofence_entry when outside → inside', async () => {
    const site = await createSite(ownerAToken, 'Site-GF2')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'GF2')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'GF2' })
    const shiftId = await startShift(op, crane.id)

    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.5,
            longitude: 72.0,
            accuracyMeters: 10,
            recordedAt: nowIso(-60),
            insideGeofence: false,
          },
        ],
      },
    })

    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.128,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(-30),
            insideGeofence: true,
          },
        ],
      },
    })

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, shiftId), eq(auditLog.action, 'shift.geofence_entry')))
    expect(audits).toHaveLength(1)
  })

  it('no audit when state remains same (inside → inside)', async () => {
    const site = await createSite(ownerAToken, 'Site-GF3')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'GF3')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'GF3' })
    const shiftId = await startShift(op, crane.id)

    for (let i = 0; i < 3; i += 1) {
      await handle.app.inject({
        method: 'POST',
        url: `/api/v1/shifts/${shiftId}/pings`,
        headers: { authorization: `Bearer ${op.token}` },
        payload: {
          pings: [
            {
              latitude: 51.128 + i * 0.0001,
              longitude: 71.43,
              accuracyMeters: 10,
              recordedAt: nowIso(-60 + i * 10),
              insideGeofence: true,
            },
          ],
        },
      })
    }

    const exits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, shiftId), eq(auditLog.action, 'shift.geofence_exit')))
    const entries = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, shiftId), eq(auditLog.action, 'shift.geofence_entry')))
    expect(exits).toHaveLength(0)
    expect(entries).toHaveLength(0)
  })

  it('no transition audit when prev is null (first-ever batch)', async () => {
    const site = await createSite(ownerAToken, 'Site-GF4')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'GF4')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'GF4' })
    const shiftId = await startShift(op, crane.id)

    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.5,
            longitude: 72.0,
            accuracyMeters: 10,
            recordedAt: nowIso(-30),
            insideGeofence: false,
          },
        ],
      },
    })

    const exits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, shiftId), eq(auditLog.action, 'shift.geofence_exit')))
    expect(exits).toHaveLength(0)
  })
})

describe('GET /api/v1/shifts/owner/locations-latest', () => {
  it('owner sees latest ping per active shift в своей org, не чужой', async () => {
    const siteA = await createSite(ownerAToken, 'Site-LA1')
    const craneA = await createApprovedCrane(ownerAToken, siteA.id, 'LA1')
    const opA = await createEmployedOperator({ organizationId: orgAId, name: 'LA1' })
    const shiftA = await startShift(opA, craneA.id)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftA}/pings`,
      headers: { authorization: `Bearer ${opA.token}` },
      payload: {
        pings: [
          {
            latitude: 51.128,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(-10),
            insideGeofence: true,
          },
        ],
      },
    })

    // Foreign org
    const siteB = await createSite(ownerBToken, 'Site-LA2')
    const craneB = await createApprovedCrane(ownerBToken, siteB.id, 'LA2')
    const opB = await createEmployedOperator({ organizationId: orgBId, name: 'LA2' })
    const shiftB = await startShift(opB, craneB.id)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftB}/pings`,
      headers: { authorization: `Bearer ${opB.token}` },
      payload: {
        pings: [
          {
            latitude: 51.129,
            longitude: 71.431,
            accuracyMeters: 10,
            recordedAt: nowIso(-5),
            insideGeofence: true,
          },
        ],
      },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/owner/locations-latest',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ shiftId: string; craneId: string }>
    const ids = items.map((i) => i.shiftId)
    expect(ids).toContain(shiftA)
    expect(ids).not.toContain(shiftB)
  })

  it('minutesSinceLastPing computed (>= 0)', async () => {
    const site = await createSite(ownerAToken, 'Site-LA3')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'LA3')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'LA3' })
    const shiftId = await startShift(op, crane.id)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.128,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(-120),
            insideGeofence: true,
          },
        ],
      },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/owner/locations-latest',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ shiftId: string; minutesSinceLastPing: number }>
    const found = items.find((i) => i.shiftId === shiftId)
    expect(found).toBeDefined()
    expect(found?.minutesSinceLastPing).toBeGreaterThanOrEqual(0)
  })

  it('excludes ended shifts', async () => {
    const site = await createSite(ownerAToken, 'Site-LA4')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'LA4')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'LA4' })
    const shiftId = await startShift(op, crane.id)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.128,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(-60),
            insideGeofence: true,
          },
        ],
      },
    })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/end`,
      headers: { authorization: `Bearer ${op.token}` },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/owner/locations-latest',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ shiftId: string }>
    expect(items.find((i) => i.shiftId === shiftId)).toBeUndefined()
  })

  it('siteId filter: only pings of shifts on given site', async () => {
    const siteX = await createSite(ownerAToken, 'Site-LA5X')
    const siteY = await createSite(ownerAToken, 'Site-LA5Y')
    const craneX = await createApprovedCrane(ownerAToken, siteX.id, 'LA5X')
    const craneY = await createApprovedCrane(ownerAToken, siteY.id, 'LA5Y')
    const opX = await createEmployedOperator({ organizationId: orgAId, name: 'LA5X' })
    const opY = await createEmployedOperator({ organizationId: orgAId, name: 'LA5Y' })
    const shiftX = await startShift(opX, craneX.id)
    const shiftY = await startShift(opY, craneY.id)
    for (const [s, op] of [
      [shiftX, opX],
      [shiftY, opY],
    ] as const) {
      await handle.app.inject({
        method: 'POST',
        url: `/api/v1/shifts/${s}/pings`,
        headers: { authorization: `Bearer ${op.token}` },
        payload: {
          pings: [
            {
              latitude: 51.128,
              longitude: 71.43,
              accuracyMeters: 10,
              recordedAt: nowIso(-10),
              insideGeofence: true,
            },
          ],
        },
      })
    }

    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/shifts/owner/locations-latest?siteId=${siteX.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ shiftId: string; siteId: string }>
    expect(items.every((i) => i.siteId === siteX.id)).toBe(true)
  })

  it('403: operator cannot use /owner/locations-latest', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'NoAccess' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/owner/locations-latest',
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/v1/shifts/:id/path', () => {
  it('returns pings ASC by recordedAt', async () => {
    const site = await createSite(ownerAToken, 'Site-P1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'P1')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'P1' })
    const shiftId = await startShift(op, crane.id)

    // Batch с 4 pings на разных временах
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [-120, -90, -60, -30].map((sec) => ({
          latitude: 51.128,
          longitude: 71.43,
          accuracyMeters: 10,
          recordedAt: nowIso(sec),
          insideGeofence: true,
        })),
      },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/shifts/${shiftId}/path`,
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.shiftId).toBe(shiftId)
    expect(body.pings).toHaveLength(4)
    const times = body.pings.map((p: { recordedAt: string }) => Date.parse(p.recordedAt))
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('sampleRate=2 downsamples to every 2nd ping', async () => {
    const site = await createSite(ownerAToken, 'Site-P2')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'P2')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'P2' })
    const shiftId = await startShift(op, crane.id)

    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: Array.from({ length: 10 }, (_, i) => ({
          latitude: 51.128,
          longitude: 71.43,
          accuracyMeters: 10,
          recordedAt: nowIso(-(10 - i) * 30),
          insideGeofence: true,
        })),
      },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/shifts/${shiftId}/path?sampleRate=2`,
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().pings).toHaveLength(5)
  })

  it('404 for cross-operator', async () => {
    const site = await createSite(ownerAToken, 'Site-P3')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'P3')
    const op1 = await createEmployedOperator({ organizationId: orgAId, name: 'P3-1' })
    const op2 = await createEmployedOperator({ organizationId: orgAId, name: 'P3-2' })
    const shiftId = await startShift(op1, crane.id)

    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/shifts/${shiftId}/path`,
      headers: { authorization: `Bearer ${op2.token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('200 for owner of same org', async () => {
    const site = await createSite(ownerAToken, 'Site-P4')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'P4')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'P4' })
    const shiftId = await startShift(op, crane.id)

    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/shifts/${shiftId}/path`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('GET /api/v1/shifts/my/active/location', () => {
  it('returns null when no active shift', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'ML1' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/my/active/location',
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toBeNull()
  })

  it('returns null when active shift без pings', async () => {
    const site = await createSite(ownerAToken, 'Site-ML2')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'ML2')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'ML2' })
    await startShift(op, crane.id)

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/my/active/location',
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toBeNull()
  })

  it('returns latest ping when exists', async () => {
    const site = await createSite(ownerAToken, 'Site-ML3')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'ML3')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'ML3' })
    const shiftId = await startShift(op, crane.id)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.128,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(-30),
            insideGeofence: true,
          },
        ],
      },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/my/active/location',
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.shiftId).toBe(shiftId)
    expect(body.latitude).toBeCloseTo(51.128, 3)
    expect(body.insideGeofence).toBe(true)
  })

  it('403: owner cannot use /my/active/location', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/shifts/my/active/location',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// Sanity: shifts table не тронут новыми pings (FK integrity)
describe('schema sanity', () => {
  it('shifts table row count unchanged after ping inserts', async () => {
    const before = await handle.app.db.db.select().from(shifts)
    const beforeCount = before.length

    // Insert 3 pings в существующий shift'ы ничего с shifts не делают
    // Просто проверяем что cascade / reference integrity не сломан.
    const site = await createSite(ownerAToken, 'Site-SS')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'SS')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'SS' })
    const shiftId = await startShift(op, crane.id)
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${shiftId}/pings`,
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        pings: [
          {
            latitude: 51.128,
            longitude: 71.43,
            accuracyMeters: 10,
            recordedAt: nowIso(),
            insideGeofence: true,
          },
        ],
      },
    })

    const after = await handle.app.db.db.select().from(shifts)
    expect(after.length).toBe(beforeCount + 1) // one shift created
  })
})
