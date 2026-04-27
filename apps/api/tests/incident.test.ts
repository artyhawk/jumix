import {
  auditLog,
  craneProfiles,
  incidentPhotos,
  incidents,
  organizationOperators,
} from '@jumix/db'
import { CHECKLIST_ITEMS, type ChecklistItemKey, REQUIRED_ITEMS_BY_CRANE_TYPE } from '@jumix/shared'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration tests для incidents + pre-shift checklist (M6, ADR 0008).
 * BIN-серия 68xxxx (не пересекается с 67xxxx M4 / 60-66 ранее).
 */

let handle: TestAppHandle

let superadminToken: string
let ownerAToken: string
let ownerBToken: string
let orgAId: string
let orgBId: string

const ASTANA_LAT = 51.128722
const ASTANA_LNG = 71.430603

function makeChecklist(opts: { skip?: ChecklistItemKey[] } = {}) {
  const skip = new Set(opts.skip ?? [])
  const items: Record<string, { checked: boolean; photoKey: null; notes: null }> = {}
  for (const key of CHECKLIST_ITEMS) {
    items[key] = { checked: !skip.has(key), photoKey: null, notes: null }
  }
  return { items }
}

beforeAll(async () => {
  handle = await buildTestApp()

  const sa = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77180000001',
    organizationId: null,
    name: 'SA',
  })
  superadminToken = await signTokenFor(handle.app, sa)

  const orgA = await createOrganization(handle.app, { name: 'Inc A', bin: '680000000001' })
  orgAId = orgA.id
  const ownerA = await createUser(handle.app, {
    role: 'owner',
    phone: '+77180000002',
    organizationId: orgAId,
    name: 'Owner A',
  })
  ownerAToken = await signTokenFor(handle.app, ownerA)

  const orgB = await createOrganization(handle.app, { name: 'Inc B', bin: '680000000002' })
  orgBId = orgB.id
  const ownerB = await createUser(handle.app, {
    role: 'owner',
    phone: '+77180000003',
    organizationId: orgBId,
    name: 'Owner B',
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

let phoneSeq = 1000
function nextPhone(): string {
  phoneSeq += 1
  return `+7718${String(phoneSeq).padStart(7, '0')}`
}

// Используем offset Date.now() для уникальности между test reruns внутри
// одного container'а (iin partial-unique active idx может конфликтовать
// при rerunʼе если seq резетится).
let iinSeq = 80_000 + (Math.floor(Date.now() / 1000) % 10000)
const seenIins = new Set<string>()
function nextIin(): string {
  // iinFor() при checksum=10 инкрементит свой внутренний base но НЕ сообщает
  // об этом наружу — соседние seeds могут вернуть один и тот же iin.
  // Set-based dedup гарантирует уникальность даже когда алгоритм коллидирует.
  for (let attempts = 0; attempts < 200; attempts += 1) {
    iinSeq += 1
    const candidate = iinFor(iinSeq)
    if (!seenIins.has(candidate)) {
      seenIins.add(candidate)
      return candidate
    }
  }
  throw new Error('nextIin: collision retries exhausted')
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
  type: 'tower' | 'mobile' | 'crawler' | 'overhead' = 'tower',
): Promise<{ id: string; siteId: string | null }> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/cranes',
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: {
      type,
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
  return { id: crane.id, siteId: crane.siteId }
}

type OperatorFixture = {
  userId: string
  profileId: string
  token: string
}

async function createEmployedOperator(opts: {
  organizationId: string
  name?: string
}): Promise<OperatorFixture> {
  const user = await createUser(handle.app, {
    role: 'operator',
    phone: nextPhone(),
    organizationId: null,
    name: opts.name ?? 'Op',
  })
  const profileRows = await handle.app.db.db
    .insert(craneProfiles)
    .values({
      userId: user.id,
      firstName: opts.name ?? 'Op',
      lastName: 'Reporter',
      patronymic: null,
      iin: nextIin(),
      specialization: {},
      approvalStatus: 'approved',
      approvedAt: new Date(),
      licenseKey: 'crane-profiles/fake/license/v1/test.pdf',
      licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      licenseVersion: 1,
    })
    .returning({ id: craneProfiles.id })
  const profileId = profileRows[0]?.id
  if (!profileId) throw new Error('profile insert failed')

  await handle.app.db.db.insert(organizationOperators).values({
    organizationId: opts.organizationId,
    craneProfileId: profileId,
    approvalStatus: 'approved',
    approvedAt: new Date(),
    status: 'active',
    hiredAt: new Date(),
  })

  const token = await signTokenFor(handle.app, user)
  return { userId: user.id, profileId, token }
}

async function startShift(
  op: OperatorFixture,
  craneId: string,
  checklist = makeChecklist(),
): Promise<string> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/shifts/start',
    headers: { authorization: `Bearer ${op.token}` },
    payload: { craneId, checklist },
  })
  if (res.statusCode !== 201) throw new Error(`start: ${res.statusCode} ${res.body}`)
  return res.json().id
}

beforeEach(async () => {
  // Изолируем тесты: сбрасываем incidents/photos/audit перед каждым тестом
  await handle.app.db.db.delete(incidentPhotos)
  await handle.app.db.db.delete(incidents)
  await handle.app.db.db.delete(auditLog).where(and(eq(auditLog.action, 'incident.create')))
})

describe('POST /api/v1/incidents/photos/upload-url', () => {
  it('200: operator gets presigned PUT', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'PhotoOp' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents/photos/upload-url',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { contentType: 'image/jpeg', filename: 'photo.jpg' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // InMemory storage в тестах использует memory:// scheme; production MinIO — http(s)://.
    expect(body.uploadUrl).toMatch(/^(https?|memory):\/\//)
    expect(body.key).toMatch(new RegExp(`^pending/${op.userId}/`))
    expect(body.headers['Content-Type']).toBe('image/jpeg')
  })

  it('403: owner cannot get upload URL', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents/photos/upload-url',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { contentType: 'image/jpeg', filename: 'photo.jpg' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('400: invalid content type', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'BadCt' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents/photos/upload-url',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { contentType: 'application/zip', filename: 'photo.zip' },
    })
    expect(res.statusCode).toBe(422) // zod regex catches it
  })
})

describe('POST /api/v1/incidents — create', () => {
  it('201: operator creates incident linked to active shift, derives org/site/crane', async () => {
    const site = await createSite(ownerAToken, 'Inc-Site-1')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'Inc-1')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'Reporter1' })
    const shiftId = await startShift(op, crane.id)

    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        type: 'crane_malfunction',
        severity: 'warning',
        description: 'Шум при подъёме стрелы — требуется проверка ТО',
        photoKeys: [],
        shiftId,
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toEqual(expect.any(String))
    expect(body.type).toBe('crane_malfunction')
    expect(body.severity).toBe('warning')
    expect(body.status).toBe('submitted')
    expect(body.organizationId).toBe(orgAId)
    expect(body.shiftId).toBe(shiftId)
    expect(body.siteId).toBe(site.id)
    expect(body.craneId).toBe(crane.id)
    expect(body.reporter.id).toBe(op.userId)
    expect(body.reporter.name).toBe('Reporter Reporter1')
    expect(body.reporter.phone).toMatch(/^\+7718/)
    expect(body.photos).toEqual([])

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, body.id), eq(auditLog.action, 'incident.create')))
    expect(audits).toHaveLength(1)
  })

  it('201: incident без shift — derives organization из user.organizationId (none → 422)', async () => {
    // Operator с organizationId=null + без active shift → NO_ORGANIZATION_CONTEXT.
    // Создаём через CreateUser напрямую — без crane_profile + без hire.
    const naked = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: null,
      name: 'NoOrgOp',
    })
    const token = await signTokenFor(handle.app, naked)

    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        type: 'other',
        severity: 'info',
        description: 'Test описание длинное',
        photoKeys: [],
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('NO_ORGANIZATION_CONTEXT')
  })

  it('400: shiftId не принадлежит вызывающему operator → SHIFT_NOT_FOUND', async () => {
    const site = await createSite(ownerAToken, 'Inc-Site-Foreign')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'Inc-Foreign')
    const opA = await createEmployedOperator({ organizationId: orgAId, name: 'OpA' })
    const opB = await createEmployedOperator({ organizationId: orgAId, name: 'OpB' })
    const shiftId = await startShift(opA, crane.id)

    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${opB.token}` },
      payload: {
        type: 'near_miss',
        severity: 'warning',
        description: 'Чужая смена попытка',
        photoKeys: [],
        shiftId,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('SHIFT_NOT_FOUND')
  })

  it('422: description короче 10 символов', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'Tooshort' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        type: 'other',
        severity: 'info',
        description: 'мало',
        photoKeys: [],
      },
    })
    expect(res.statusCode).toBe(422)
  })

  it('400: photoKey не принадлежит вызывающему operator → PHOTO_KEY_NOT_OWNED', async () => {
    const opA = await createEmployedOperator({ organizationId: orgAId, name: 'OpKeyA' })
    const opB = await createEmployedOperator({ organizationId: orgAId, name: 'OpKeyB' })
    // Take photo as opA
    const aKey = (
      await handle.app.inject({
        method: 'POST',
        url: '/api/v1/incidents/photos/upload-url',
        headers: { authorization: `Bearer ${opA.token}` },
        payload: { contentType: 'image/jpeg', filename: 'a.jpg' },
      })
    ).json().key

    // Попытка использовать его в incident.create от opB
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${opB.token}` },
      payload: {
        type: 'other',
        severity: 'info',
        description: 'Используем чужой ключ',
        photoKeys: [aKey],
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('PHOTO_KEY_NOT_OWNED')
  })

  it('403: owner cannot create incident', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        type: 'other',
        severity: 'info',
        description: 'Owner попытка отправить',
        photoKeys: [],
      },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/v1/incidents/my', () => {
  it('200: operator видит только свои incident-ы', async () => {
    const opA = await createEmployedOperator({ organizationId: orgAId, name: 'MyA' })
    const opB = await createEmployedOperator({ organizationId: orgAId, name: 'MyB' })

    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${opA.token}` },
      payload: { type: 'other', severity: 'info', description: 'My report A', photoKeys: [] },
    })
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${opB.token}` },
      payload: { type: 'other', severity: 'info', description: 'My report B', photoKeys: [] },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/incidents/my',
      headers: { authorization: `Bearer ${opA.token}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ reporter: { id: string } }>
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items.every((i) => i.reporter.id === opA.userId)).toBe(true)
  })
})

describe('GET /api/v1/incidents/owner — list for org', () => {
  it('200: owner видит свою org; superadmin видит всё; cross-org filtered', async () => {
    const opA = await createEmployedOperator({ organizationId: orgAId, name: 'OrgA' })
    const opB = await createEmployedOperator({ organizationId: orgBId, name: 'OrgB' })

    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${opA.token}` },
      payload: { type: 'other', severity: 'warning', description: 'Org A report 1', photoKeys: [] },
    })
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${opB.token}` },
      payload: {
        type: 'other',
        severity: 'critical',
        description: 'Org B critical',
        photoKeys: [],
      },
    })

    const ownerARes = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/incidents/owner',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const ownerAItems = ownerARes.json().items as Array<{ organizationId: string }>
    expect(ownerAItems.every((i) => i.organizationId === orgAId)).toBe(true)

    const saRes = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/incidents/owner',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    const orgIds = new Set(
      (saRes.json().items as Array<{ organizationId: string }>).map((i) => i.organizationId),
    )
    expect(orgIds.has(orgAId)).toBe(true)
    expect(orgIds.has(orgBId)).toBe(true)
  })

  it('200: owner filtered by severity=critical', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'Sev' })
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { type: 'other', severity: 'info', description: 'info report', photoKeys: [] },
    })
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        type: 'other',
        severity: 'critical',
        description: 'critical report',
        photoKeys: [],
      },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/incidents/owner?severity=critical',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const items = res.json().items as Array<{ severity: string }>
    expect(items.every((i) => i.severity === 'critical')).toBe(true)
    expect(items.length).toBeGreaterThanOrEqual(1)
  })

  it('403: operator cannot list /owner', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'NoListOwner' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/incidents/owner',
      headers: { authorization: `Bearer ${op.token}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('Incident state machine — acknowledge / resolve / escalate', () => {
  async function newIncident(): Promise<{ id: string; opToken: string }> {
    const op = await createEmployedOperator({
      organizationId: orgAId,
      name: `St${Date.now() % 10000}`,
    })
    const r = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        type: 'other',
        severity: 'warning',
        description: 'State machine seed',
        photoKeys: [],
      },
    })
    expect(r.statusCode).toBe(201)
    return { id: r.json().id, opToken: op.token }
  }

  it('acknowledge: submitted → acknowledged (owner)', async () => {
    const { id } = await newIncident()
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/acknowledge`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('acknowledged')
  })

  it('acknowledge twice → 409 INVALID_INCIDENT_TRANSITION', async () => {
    const { id } = await newIncident()
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/acknowledge`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/acknowledge`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('INVALID_INCIDENT_TRANSITION')
  })

  it('resolve: acknowledged → resolved (owner) + notes audit', async () => {
    const { id } = await newIncident()
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/acknowledge`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/resolve`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { notes: 'Issue resolved on site' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('resolved')
    expect(res.json().resolutionNotes).toBe('Issue resolved on site')
  })

  it('escalate: submitted → escalated (owner)', async () => {
    const { id } = await newIncident()
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/escalate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { notes: 'нужна юридическая консультация' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('escalated')
  })

  it('owner cannot resolve escalated incident → 409', async () => {
    const { id } = await newIncident()
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/escalate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/resolve`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { notes: 'попытка' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('superadmin resolves escalated', async () => {
    const { id } = await newIncident()
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/escalate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/resolve`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { notes: 'Resolved at platform' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('resolved')
  })

  it('de-escalate: superadmin reverts escalated → acknowledged', async () => {
    const { id } = await newIncident()
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/escalate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/de-escalate`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('acknowledged')
  })

  it('owner cannot escalate чужой org incident', async () => {
    const { id } = await newIncident() // belongs to orgA
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/escalate`,
      headers: { authorization: `Bearer ${ownerBToken}` },
    })
    // OwnerB видит 404 (не в scope) — за-incident-from-foreign-org reads 404
    expect(res.statusCode).toBe(404)
  })

  it('owner of foreign org cannot acknowledge', async () => {
    const { id } = await newIncident()
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/incidents/${id}/acknowledge`,
      headers: { authorization: `Bearer ${ownerBToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/v1/incidents/:id — detail with photoUrls', () => {
  it('200: owner gets detail with photoUrls map', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'DetailOp' })
    const created = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        type: 'other',
        severity: 'info',
        description: 'detail incident desc',
        photoKeys: [],
      },
    })
    const id = created.json().id

    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/incidents/${id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(id)
  })

  it('404: foreign org', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'ForOp' })
    const created = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/incidents',
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        type: 'other',
        severity: 'info',
        description: 'foreign incident desc',
        photoKeys: [],
      },
    })
    const id = created.json().id
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/incidents/${id}`,
      headers: { authorization: `Bearer ${ownerBToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Pre-shift checklist (atomic with shift.start)
// ---------------------------------------------------------------------------

describe('POST /api/v1/shifts/start — pre-shift checklist (M6)', () => {
  it('201: tower crane — все required + harness checked → shift creates', async () => {
    const site = await createSite(ownerAToken, 'CL-Site-Tower')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'CL-Tower', 'tower')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'Tower1' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { craneId: crane.id, checklist: makeChecklist() },
    })
    expect(res.statusCode).toBe(201)
    const shiftId = res.json().id

    // Audit: shift.start + checklist.submit
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetId, shiftId))
    const actions = audits.map((a) => a.action).sort()
    expect(actions).toContain('shift.start')
    expect(actions).toContain('checklist.submit')
  })

  it('422 CHECKLIST_INCOMPLETE: tower crane без harness checked', async () => {
    const site = await createSite(ownerAToken, 'CL-Site-NoHarness')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'CL-NoHarness', 'tower')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'NoHarness' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        craneId: crane.id,
        checklist: makeChecklist({ skip: ['harness'] }),
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('CHECKLIST_INCOMPLETE')
    expect(res.json().error.details.missing).toContain('harness')
  })

  it('201: mobile crane — harness не required, shift starts даже если harness=false', async () => {
    const site = await createSite(ownerAToken, 'CL-Site-Mobile')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'CL-Mobile', 'mobile')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'MobileOp' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        craneId: crane.id,
        checklist: makeChecklist({ skip: ['harness'] }),
      },
    })
    expect(res.statusCode).toBe(201)
  })

  it('422 CHECKLIST_INCOMPLETE: helmet=false для любого крана', async () => {
    const site = await createSite(ownerAToken, 'CL-Site-Helmet')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'CL-Helmet', 'mobile')
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'NoHelmet' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${op.token}` },
      payload: {
        craneId: crane.id,
        checklist: makeChecklist({ skip: ['helmet'] }),
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.details.missing).toContain('helmet')
  })

  it('400 CHECKLIST_PHOTO_KEY_NOT_OWNED: photoKey чужого operator-а', async () => {
    const site = await createSite(ownerAToken, 'CL-Site-Foreign')
    const crane = await createApprovedCrane(ownerAToken, site.id, 'CL-Foreign', 'mobile')
    const opA = await createEmployedOperator({ organizationId: orgAId, name: 'KeyA' })
    const opB = await createEmployedOperator({ organizationId: orgAId, name: 'KeyB' })

    // opA берёт фото
    const aKey = (
      await handle.app.inject({
        method: 'POST',
        url: '/api/v1/checklists/photos/upload-url',
        headers: { authorization: `Bearer ${opA.token}` },
        payload: { contentType: 'image/jpeg', filename: 'helmet.jpg' },
      })
    ).json().key

    // opB пытается использовать чужой ключ в своём checklist
    const checklist = makeChecklist()
    checklist.items.helmet = { checked: true, photoKey: aKey, notes: null }

    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/shifts/start',
      headers: { authorization: `Bearer ${opB.token}` },
      payload: { craneId: crane.id, checklist },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('CHECKLIST_PHOTO_KEY_NOT_OWNED')
  })

  it('REQUIRED_ITEMS_BY_CRANE_TYPE shape sanity', () => {
    expect(REQUIRED_ITEMS_BY_CRANE_TYPE.tower).toContain('harness')
    expect(REQUIRED_ITEMS_BY_CRANE_TYPE.mobile).not.toContain('harness')
  })
})

describe('POST /api/v1/checklists/photos/upload-url', () => {
  it('200: operator gets presigned PUT', async () => {
    const op = await createEmployedOperator({ organizationId: orgAId, name: 'CLPhotoOp' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/checklists/photos/upload-url',
      headers: { authorization: `Bearer ${op.token}` },
      payload: { contentType: 'image/jpeg', filename: 'helmet.jpg' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().key).toMatch(new RegExp(`^pending/${op.userId}/`))
  })

  it('403: owner cannot get checklist photo upload-url', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/checklists/photos/upload-url',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { contentType: 'image/jpeg', filename: 'h.jpg' },
    })
    expect(res.statusCode).toBe(403)
  })
})
