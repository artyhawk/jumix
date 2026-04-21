import { auditLog } from '@jumix/db'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты sites-модуля. Проверяют CRUD, RBAC (superadmin / owner /
 * operator), action-endpoints /complete /archive /activate, coordinate
 * round-trip через PostGIS, DB-level CHECK constraint на радиус, cross-org
 * изоляцию.
 *
 * Один Postgres-контейнер (postgis/postgis:16-3.4-alpine) на весь файл; каждый
 * тест создаёт свои sites через API или фикстуры чтобы не пересекаться с
 * соседями.
 *
 * Валидные BIN'ы (checksum): значения в createOrganization берутся из
 * shared/bin — 6xx... серия не конфликтует с organization.test.ts.
 */

let handle: TestAppHandle

// shared fixtures, создаются один раз
let superadminToken: string
let ownerAToken: string
let operatorAToken: string
let orgAId: string
let orgBId: string
let ownerBToken: string

// Астана, EXPO-центр
const ASTANA_LAT = 51.128722
const ASTANA_LNG = 71.430603
// Алматы, Республики 44
const ALMATY_LAT = 43.238949
const ALMATY_LNG = 76.889709

beforeAll(async () => {
  handle = await buildTestApp()

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77110000001',
    organizationId: null,
    name: 'Super Admin',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const orgA = await createOrganization(handle.app, { name: 'Sites A', bin: '610000000001' })
  orgAId = orgA.id
  const ownerA = await createUser(handle.app, {
    role: 'owner',
    phone: '+77110000002',
    organizationId: orgAId,
    name: 'Owner A',
  })
  ownerAToken = await signTokenFor(handle.app, ownerA)

  const orgB = await createOrganization(handle.app, { name: 'Sites B', bin: '610000000002' })
  orgBId = orgB.id
  const ownerB = await createUser(handle.app, {
    role: 'owner',
    phone: '+77110000003',
    organizationId: orgBId,
    name: 'Owner B',
  })
  ownerBToken = await signTokenFor(handle.app, ownerB)

  const operatorA = await createUser(handle.app, {
    role: 'operator',
    phone: '+77110000004',
    organizationId: orgAId,
    name: 'Operator A',
  })
  operatorAToken = await signTokenFor(handle.app, operatorA)
}, 60_000)

afterAll(async () => {
  await handle.close()
})

async function createSite(
  token: string,
  body: Partial<{
    name: string
    address: string
    latitude: number
    longitude: number
    radiusM: number
    notes: string
  }> = {},
): Promise<{ id: string; organizationId: string; latitude: number; longitude: number }> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/sites',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      name: body.name ?? 'Default Site',
      latitude: body.latitude ?? ASTANA_LAT,
      longitude: body.longitude ?? ASTANA_LNG,
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.radiusM !== undefined ? { radiusM: body.radiusM } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
  })
  if (res.statusCode !== 201) throw new Error(`createSite failed: ${res.statusCode} ${res.body}`)
  const json = res.json()
  return {
    id: json.id,
    organizationId: json.organizationId,
    latitude: json.latitude,
    longitude: json.longitude,
  }
}

describe('POST /api/v1/sites (create)', () => {
  it('201: owner creates site in own org; audit row written inside transaction', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        name: 'ЖК Northside',
        address: 'Астана, ул. Мангилик Ел 55',
        latitude: ASTANA_LAT,
        longitude: ASTANA_LNG,
        radiusM: 200,
        notes: 'Башня A',
      },
    })
    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.id).toEqual(expect.any(String))
    expect(json.organizationId).toBe(orgAId)
    expect(json.name).toBe('ЖК Northside')
    expect(json.address).toBe('Астана, ул. Мангилик Ел 55')
    expect(json.latitude).toBe(ASTANA_LAT)
    expect(json.longitude).toBe(ASTANA_LNG)
    expect(json.radiusM).toBe(200)
    expect(json.status).toBe('active')

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, json.id), eq(auditLog.action, 'site.create')))
    expect(audits).toHaveLength(1)
    expect(audits[0]?.organizationId).toBe(orgAId)
    const meta = audits[0]?.metadata as Record<string, unknown>
    expect(meta.latitude).toBe(ASTANA_LAT)
    expect(meta.longitude).toBe(ASTANA_LNG)
  })

  it('201: owner creates site without optional fields — radiusM defaults to 150', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'Minimal', latitude: 51.0, longitude: 71.0 },
    })
    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.radiusM).toBe(150)
    expect(json.address).toBeNull()
    expect(json.notes).toBeNull()
  })

  it('201: site belongs to OWNER org regardless of body organizationId (field stripped)', async () => {
    // Owner A пытается указать orgB в body — zod должен проигнорировать поле,
    // service берёт organizationId из ctx.
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        name: 'Hostile OrgId',
        latitude: ASTANA_LAT,
        longitude: ASTANA_LNG,
        organizationId: orgBId, // should be ignored
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().organizationId).toBe(orgAId)
  })

  it('403: superadmin cannot create site (no org to create into)', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { name: 'X', latitude: ASTANA_LAT, longitude: ASTANA_LNG },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('403: operator cannot create site', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${operatorAToken}` },
      payload: { name: 'X', latitude: ASTANA_LAT, longitude: ASTANA_LNG },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated create rejected', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/sites',
      payload: { name: 'X', latitude: ASTANA_LAT, longitude: ASTANA_LNG },
    })
    expect(res.statusCode).toBe(401)
  })

  it('422: radius out of range rejected by Zod', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'X', latitude: ASTANA_LAT, longitude: ASTANA_LNG, radiusM: 50000 },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: latitude out of [-90..90] rejected by Zod', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'X', latitude: 95, longitude: ASTANA_LNG },
    })
    expect(res.statusCode).toBe(422)
  })
})

describe('GET /api/v1/sites (list)', () => {
  it('200: owner sees ONLY sites from their organization (no foreign leak)', async () => {
    // seed: по 2 site у каждой org
    await createSite(ownerAToken, { name: 'A-Site-1' })
    await createSite(ownerAToken, { name: 'A-Site-2' })
    await createSite(ownerBToken, { name: 'B-Site-1' })
    await createSite(ownerBToken, { name: 'B-Site-2' })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ organizationId: string }>
    expect(items.length).toBeGreaterThanOrEqual(2)
    for (const item of items) {
      expect(item.organizationId).toBe(orgAId)
    }
  })

  it('200: superadmin sees sites across all organizations', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/sites?limit=100',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ organizationId: string }>
    const orgs = new Set(items.map((i) => i.organizationId))
    expect(orgs.size).toBeGreaterThanOrEqual(2)
  })

  it('200: cursor pagination yields subsequent pages without overlap', async () => {
    const first = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/sites?limit=1',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(first.statusCode).toBe(200)
    const p1 = first.json()
    expect(p1.items).toHaveLength(1)
    expect(p1.nextCursor).toEqual(expect.any(String))

    const second = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/sites?limit=1&cursor=${p1.nextCursor}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(second.statusCode).toBe(200)
    const p2 = second.json()
    if (p2.items.length > 0) {
      expect(p2.items[0].id).not.toBe(p1.items[0].id)
    }
  })

  it('200: search by name filters across name and address', async () => {
    await createSite(ownerAToken, { name: 'UNIQUE-SEARCH-TOKEN-Site' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/sites?search=UNIQUE-SEARCH-TOKEN',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ name: string }>
    expect(items.length).toBe(1)
    expect(items[0]?.name).toContain('UNIQUE-SEARCH-TOKEN')
  })

  it('200: status=archived filter returns only archived sites', async () => {
    const s = await createSite(ownerAToken, { name: 'To-Archive' })
    const archiveRes = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/sites/${s.id}/archive`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(archiveRes.statusCode).toBe(200)

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/sites?status=archived&limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ id: string; status: string }>
    expect(items.every((i) => i.status === 'archived')).toBe(true)
    expect(items.some((i) => i.id === s.id)).toBe(true)
  })

  it('403: operator cannot list sites', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${operatorAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated rejected', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/api/v1/sites' })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/v1/sites/:id', () => {
  it('200: owner reads own site', async () => {
    const s = await createSite(ownerAToken, { name: 'Readable' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/sites/${s.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(s.id)
  })

  it('200: superadmin reads any site', async () => {
    const s = await createSite(ownerAToken, { name: 'Super-Readable' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/sites/${s.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('404: owner accessing foreign site gets 404 (existence hidden, not 403)', async () => {
    const foreign = await createSite(ownerBToken, { name: 'Foreign' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/sites/${foreign.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('SITE_NOT_FOUND')
  })

  it('404: operator cannot see any site (own org or foreign)', async () => {
    const own = await createSite(ownerAToken, { name: 'OperatorHidden' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/sites/${own.id}`,
      headers: { authorization: `Bearer ${operatorAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('401: unauthenticated rejected', async () => {
    const s = await createSite(ownerAToken, { name: 'AuthRequired' })
    const res = await handle.app.inject({ method: 'GET', url: `/api/v1/sites/${s.id}` })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/v1/sites/:id (update)', () => {
  it('200: owner updates name/address/radius of own site', async () => {
    const s = await createSite(ownerAToken, { name: 'Before' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/sites/${s.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'After', address: 'New address', radiusM: 300 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('After')
    expect(res.json().address).toBe('New address')
    expect(res.json().radiusM).toBe(300)

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, s.id), eq(auditLog.action, 'site.update')))
    expect(audits.length).toBeGreaterThanOrEqual(1)
  })

  it('200: owner can update coordinates; geofence_center rewritten', async () => {
    const s = await createSite(ownerAToken, {
      name: 'Coord-Update',
      latitude: ASTANA_LAT,
      longitude: ASTANA_LNG,
    })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/sites/${s.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { latitude: ALMATY_LAT, longitude: ALMATY_LNG },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().latitude).toBe(ALMATY_LAT)
    expect(res.json().longitude).toBe(ALMATY_LNG)
  })

  it('200: superadmin can update any site', async () => {
    const s = await createSite(ownerAToken, { name: 'Super-Update' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/sites/${s.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { name: 'Super-Updated' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Super-Updated')
  })

  it('200: null clears nullable field (address/notes)', async () => {
    const s = await createSite(ownerAToken, { name: 'With-Address', address: 'Initial' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/sites/${s.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { address: null },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().address).toBeNull()
  })

  it('404: owner cannot update foreign site', async () => {
    const foreign = await createSite(ownerBToken, { name: 'OrgB-Site' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/sites/${foreign.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'Hijack' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('422: latitude without longitude rejected (must be pair)', async () => {
    const s = await createSite(ownerAToken, { name: 'Pair-Required' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/sites/${s.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { latitude: 52.0 },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: empty patch rejected by schema refine', async () => {
    const s = await createSite(ownerAToken, { name: 'Empty-Patch' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/sites/${s.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })

  it('401: unauthenticated rejected', async () => {
    const s = await createSite(ownerAToken, { name: 'Auth' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/sites/${s.id}`,
      payload: { name: 'X' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/v1/sites/:id/{complete,archive,activate}', () => {
  it('200: active → completed; audit row with action site.complete', async () => {
    const s = await createSite(ownerAToken, { name: 'Completes' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/sites/${s.id}/complete`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('completed')

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, s.id), eq(auditLog.action, 'site.complete')))
    expect(audits).toHaveLength(1)
  })

  it('200: completed → archived', async () => {
    const s = await createSite(ownerAToken, { name: 'Complete-Archive' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/sites/${s.id}/complete`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/sites/${s.id}/archive`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('archived')
  })

  it('200: archived → active (undo archive)', async () => {
    const s = await createSite(ownerAToken, { name: 'Reactivate' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/sites/${s.id}/archive`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/sites/${s.id}/activate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('active')
  })

  it('200: idempotent — double-complete does not create duplicate audit row', async () => {
    const s = await createSite(ownerAToken, { name: 'Idempotent' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/sites/${s.id}/complete`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/sites/${s.id}/complete`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('completed')
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, s.id), eq(auditLog.action, 'site.complete')))
    expect(audits).toHaveLength(1)
  })

  it('409: archived → completed rejected (must go via active)', async () => {
    const s = await createSite(ownerAToken, { name: 'Bad-Transition' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/sites/${s.id}/archive`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/sites/${s.id}/complete`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('404: owner cannot change status of foreign site', async () => {
    const foreign = await createSite(ownerBToken, { name: 'Foreign-Status' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/sites/${foreign.id}/archive`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('Data layer guarantees', () => {
  it('coordinates round-trip through PostGIS without precision loss (6 digits)', async () => {
    // Разные lat/lng чтобы проверить что X→lng и Y→lat не перепутаны
    const s = await createSite(ownerAToken, {
      name: 'Precision',
      latitude: 51.128722,
      longitude: 71.430603,
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/sites/${s.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().latitude).toBe(51.128722)
    expect(res.json().longitude).toBe(71.430603)
  })

  it('PostGIS orientation: ST_MakePoint(lng, lat) — X=lng, Y=lat', async () => {
    // Распутываем потенциальную перепутку: позиция в северной широте 50+,
    // позиция в восточной долготе 70+. Если перепутаем — API вернёт позиции
    // в другом полушарии.
    const s = await createSite(ownerAToken, {
      name: 'Orientation',
      latitude: 51.5,
      longitude: 71.5,
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/sites/${s.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.json().latitude).toBe(51.5)
    expect(res.json().longitude).toBe(71.5)
  })

  it('DB CHECK constraint rejects geofence_radius_m=0 even if zod bypassed', async () => {
    // Пишем напрямую через drizzle, минуя zod-валидацию handler'а, чтобы
    // убедиться что constraint работает как страховка второго уровня.
    const invalidInsert = handle.app.db.db.execute(sql`
      INSERT INTO sites (organization_id, name, geofence_center, geofence_radius_m)
      VALUES (${orgAId}, 'Invalid', ST_MakePoint(71.0, 51.0)::geography, 0)
    `)
    await expect(invalidInsert).rejects.toThrow(/sites_geofence_radius_chk/i)
  })

  it('DB CHECK constraint rejects geofence_radius_m > 10000', async () => {
    const invalidInsert = handle.app.db.db.execute(sql`
      INSERT INTO sites (organization_id, name, geofence_center, geofence_radius_m)
      VALUES (${orgAId}, 'Invalid', ST_MakePoint(71.0, 51.0)::geography, 20000)
    `)
    await expect(invalidInsert).rejects.toThrow(/sites_geofence_radius_chk/i)
  })

  it('FK ON DELETE RESTRICT: cannot delete organization while sites exist', async () => {
    const orphanOrg = await createOrganization(handle.app, { bin: '610000000003' })
    await handle.app.db.db.execute(sql`
      INSERT INTO sites (organization_id, name, geofence_center)
      VALUES (${orphanOrg.id}, 'Holding', ST_MakePoint(71.0, 51.0)::geography)
    `)
    const del = handle.app.db.db.execute(sql`DELETE FROM organizations WHERE id = ${orphanOrg.id}`)
    await expect(del).rejects.toThrow(/violates foreign key/i)
  })
})
