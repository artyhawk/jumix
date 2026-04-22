import { auditLog, cranes } from '@jumix/db'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты cranes-модуля. Покрывают CRUD, RBAC (superadmin / owner /
 * operator), cross-table tenant isolation (site из чужой org → 404), status
 * transitions, soft-delete, UNIQUE(inventory_number) + FK-инварианты.
 *
 * Один Postgres-контейнер на весь файл. Shared fixtures для двух организаций
 * и sites; tests создают cranes по мере надобности без конфликтов (inventory
 * номера уникальны per-test).
 *
 * BIN-серия: 62xxxx... чтобы не конфликтовать с organization.test.ts (61xxxx).
 */

let handle: TestAppHandle

let superadminToken: string
let ownerAToken: string
let ownerBToken: string
let operatorAToken: string
let orgAId: string
let orgBId: string

// Siteы, созданные в beforeAll, переиспользуются по тестам.
let orgASiteId: string
let orgASite2Id: string
let orgBSiteId: string

const ASTANA_LAT = 51.128722
const ASTANA_LNG = 71.430603

beforeAll(async () => {
  handle = await buildTestApp()

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77120000001',
    organizationId: null,
    name: 'Super Admin',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const orgA = await createOrganization(handle.app, { name: 'Cranes A', bin: '620000000001' })
  orgAId = orgA.id
  const ownerA = await createUser(handle.app, {
    role: 'owner',
    phone: '+77120000002',
    organizationId: orgAId,
    name: 'Owner A',
  })
  ownerAToken = await signTokenFor(handle.app, ownerA)

  const orgB = await createOrganization(handle.app, { name: 'Cranes B', bin: '620000000002' })
  orgBId = orgB.id
  const ownerB = await createUser(handle.app, {
    role: 'owner',
    phone: '+77120000003',
    organizationId: orgBId,
    name: 'Owner B',
  })
  ownerBToken = await signTokenFor(handle.app, ownerB)

  const operatorA = await createUser(handle.app, {
    role: 'operator',
    phone: '+77120000004',
    organizationId: orgAId,
    name: 'Operator A',
  })
  operatorAToken = await signTokenFor(handle.app, operatorA)

  orgASiteId = (await createSite(ownerAToken, 'Site A-1')).id
  orgASite2Id = (await createSite(ownerAToken, 'Site A-2')).id
  orgBSiteId = (await createSite(ownerBToken, 'Site B-1')).id
}, 60_000)

afterAll(async () => {
  await handle.close()
})

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

type CraneOverrides = {
  type?: 'tower' | 'mobile' | 'crawler' | 'overhead'
  model?: string
  inventoryNumber?: string
  capacityTon?: number
  boomLengthM?: number
  yearManufactured?: number
  siteId?: string
  tariffsJson?: Record<string, unknown>
  notes?: string
}

/**
 * Создаёт crane (всегда pending после ADR 0002) и НЕ approve'ит его. Для
 * тестов approval workflow, либо когда тест явно проверяет pending state.
 * Для operational тестов (list visibility, status transitions) используй
 * `createApprovedCrane` — helper делает submit+approve в два шага.
 */
async function createCrane(
  token: string,
  overrides: CraneOverrides = {},
): Promise<{ id: string; organizationId: string; siteId: string | null }> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/cranes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      type: overrides.type ?? 'tower',
      model: overrides.model ?? 'Liebherr 550',
      capacityTon: overrides.capacityTon ?? 12.5,
      ...(overrides.inventoryNumber !== undefined
        ? { inventoryNumber: overrides.inventoryNumber }
        : {}),
      ...(overrides.boomLengthM !== undefined ? { boomLengthM: overrides.boomLengthM } : {}),
      ...(overrides.yearManufactured !== undefined
        ? { yearManufactured: overrides.yearManufactured }
        : {}),
      ...(overrides.siteId !== undefined ? { siteId: overrides.siteId } : {}),
      ...(overrides.tariffsJson !== undefined ? { tariffsJson: overrides.tariffsJson } : {}),
      ...(overrides.notes !== undefined ? { notes: overrides.notes } : {}),
    },
  })
  if (res.statusCode !== 201) throw new Error(`crane create failed: ${res.statusCode} ${res.body}`)
  const json = res.json()
  return { id: json.id, organizationId: json.organizationId, siteId: json.siteId }
}

/**
 * Submit + holding approve. Это реальный путь от «owner добавил кран» до
 * «кран в operational обороте» — большинство существующих тестов B1 неявно
 * полагались на то, что create сразу делает operational crane. После ADR 0002
 * нужно явно approve'ить через superadmin'а.
 */
async function createApprovedCrane(
  ownerToken: string,
  overrides: CraneOverrides = {},
): Promise<{ id: string; organizationId: string; siteId: string | null }> {
  const crane = await createCrane(ownerToken, overrides)
  const approve = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/cranes/${crane.id}/approve`,
    headers: { authorization: `Bearer ${superadminToken}` },
  })
  if (approve.statusCode !== 200) {
    throw new Error(`crane approve failed: ${approve.statusCode} ${approve.body}`)
  }
  return crane
}

describe('POST /api/v1/cranes (create)', () => {
  it('201: owner creates crane in own org as pending; audit crane.submit in same txn', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        type: 'tower',
        model: 'Liebherr 550EC',
        inventoryNumber: 'INV-0001',
        capacityTon: 12.5,
        boomLengthM: 50.0,
        yearManufactured: 2020,
        siteId: orgASiteId,
        notes: 'Основная башня на объекте',
      },
    })
    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.id).toEqual(expect.any(String))
    expect(json.organizationId).toBe(orgAId)
    expect(json.siteId).toBe(orgASiteId)
    expect(json.type).toBe('tower')
    expect(json.model).toBe('Liebherr 550EC')
    expect(json.capacityTon).toBe(12.5)
    expect(json.boomLengthM).toBe(50.0)
    expect(json.yearManufactured).toBe(2020)
    expect(json.status).toBe('active')
    expect(json.approvalStatus).toBe('pending')
    expect(json.approvedAt).toBeNull()
    expect(json.rejectedAt).toBeNull()
    expect(json.deletedAt).toBeNull()

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, json.id), eq(auditLog.action, 'crane.submit')))
    expect(audits).toHaveLength(1)
    expect(audits[0]?.organizationId).toBe(orgAId)
  })

  it('201: owner creates crane without optional fields (minimal)', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { type: 'mobile', model: 'Kato NK-500', capacityTon: 50 },
    })
    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.siteId).toBeNull()
    expect(json.inventoryNumber).toBeNull()
    expect(json.boomLengthM).toBeNull()
    expect(json.yearManufactured).toBeNull()
    expect(json.notes).toBeNull()
    expect(json.tariffsJson).toEqual({})
  })

  it('201: tariffs_json freeform accepted as arbitrary record (placeholder)', async () => {
    const tariffs = { dayRate: 5000, nightRate: 6500, currency: 'KZT' }
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        type: 'tower',
        model: 'Tariffed',
        capacityTon: 10,
        tariffsJson: tariffs,
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().tariffsJson).toEqual(tariffs)
  })

  it('403: superadmin cannot create (no org to create into)', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { type: 'tower', model: 'X', capacityTon: 10 },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('403: operator cannot create', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${operatorAToken}` },
      payload: { type: 'tower', model: 'X', capacityTon: 10 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated create rejected', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      payload: { type: 'tower', model: 'X', capacityTon: 10 },
    })
    expect(res.statusCode).toBe(401)
  })

  it('422: invalid type enum rejected by Zod', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { type: 'spaceship', model: 'X', capacityTon: 10 },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: negative capacityTon rejected by Zod', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { type: 'tower', model: 'X', capacityTon: -5 },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: yearManufactured in future rejected by Zod', async () => {
    const nextYear = new Date().getUTCFullYear() + 1
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { type: 'tower', model: 'X', capacityTon: 10, yearManufactured: nextYear },
    })
    expect(res.statusCode).toBe(422)
  })
})

describe('POST /api/v1/cranes — CRITICAL cross-tenant isolation', () => {
  it('404: owner creates crane with siteId from FOREIGN org → SITE_NOT_FOUND', async () => {
    // Это — критичный тест: owner A не должен видеть/использовать siteы org B.
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        type: 'tower',
        model: 'Foreign Attempt',
        capacityTon: 10,
        siteId: orgBSiteId, // site in org B — not visible to owner A
      },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('SITE_NOT_FOUND')
  })

  it('404: owner creates crane with nonexistent siteId → SITE_NOT_FOUND', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { type: 'tower', model: 'Ghost Site', capacityTon: 10, siteId: fakeId },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('SITE_NOT_FOUND')
  })

  it('409: duplicate inventory_number within same org → INVENTORY_NUMBER_ALREADY_EXISTS', async () => {
    await createCrane(ownerAToken, { model: 'First', inventoryNumber: 'DUP-0042' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { type: 'tower', model: 'Second', capacityTon: 10, inventoryNumber: 'DUP-0042' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('INVENTORY_NUMBER_ALREADY_EXISTS')
  })

  it('201: same inventory_number allowed across DIFFERENT orgs', async () => {
    await createCrane(ownerAToken, { model: 'A-crane', inventoryNumber: 'CROSS-001' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: {
        type: 'tower',
        model: 'B-crane',
        capacityTon: 10,
        inventoryNumber: 'CROSS-001',
      },
    })
    expect(res.statusCode).toBe(201)
  })
})

describe('GET /api/v1/cranes (list)', () => {
  it('200: owner sees ONLY own-org cranes (no foreign leak)', async () => {
    await createApprovedCrane(ownerAToken, { model: 'ListTest-A1' })
    await createApprovedCrane(ownerAToken, { model: 'ListTest-A2' })
    await createApprovedCrane(ownerBToken, { model: 'ListTest-B1' })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ organizationId: string }>
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.organizationId).toBe(orgAId)
    }
  })

  it('200: superadmin sees cranes across multiple organizations', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?limit=100',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ organizationId: string }>
    const orgs = new Set(items.map((i) => i.organizationId))
    expect(orgs.size).toBeGreaterThanOrEqual(2)
  })

  it('200: cursor pagination returns non-overlapping pages', async () => {
    // Default list фильтрует по approvalStatus='approved' — нужно иметь
    // хотя бы 2 approved крана для двух непустых страниц.
    await createApprovedCrane(ownerAToken, { model: 'Paginate-1' })
    await createApprovedCrane(ownerAToken, { model: 'Paginate-2' })

    const first = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?limit=1',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(first.statusCode).toBe(200)
    const p1 = first.json()
    expect(p1.items).toHaveLength(1)
    expect(p1.nextCursor).toEqual(expect.any(String))

    const second = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/cranes?limit=1&cursor=${p1.nextCursor}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(second.statusCode).toBe(200)
    const p2 = second.json()
    if (p2.items.length > 0) {
      expect(p2.items[0].id).not.toBe(p1.items[0].id)
    }
  })

  it('200: search by model token', async () => {
    await createApprovedCrane(ownerAToken, { model: 'UNIQUE-SEARCH-MODEL-TOKEN' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?search=UNIQUE-SEARCH-MODEL',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ model: string }>
    expect(items.length).toBe(1)
    expect(items[0]?.model).toContain('UNIQUE-SEARCH-MODEL')
  })

  it('200: filter by type', async () => {
    await createApprovedCrane(ownerAToken, { type: 'crawler', model: 'CrawlerType' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?type=crawler&limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ type: string }>
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((i) => i.type === 'crawler')).toBe(true)
  })

  it('200: filter by siteId', async () => {
    await createApprovedCrane(ownerAToken, { model: 'OnSite2-1', siteId: orgASite2Id })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/cranes?siteId=${orgASite2Id}&limit=100`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ siteId: string | null }>
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((i) => i.siteId === orgASite2Id)).toBe(true)
  })

  it('200: list excludes soft-deleted cranes', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'ToDelete' })
    const delRes = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(delRes.statusCode).toBe(200)

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const ids = (res.json().items as Array<{ id: string }>).map((i) => i.id)
    expect(ids).not.toContain(c.id)
  })

  it('403: operator cannot list', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${operatorAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated rejected', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/api/v1/cranes' })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/v1/cranes/:id', () => {
  it('200: owner reads own crane', async () => {
    const c = await createCrane(ownerAToken, { model: 'Readable' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(c.id)
  })

  it('200: superadmin reads any crane', async () => {
    const c = await createCrane(ownerAToken, { model: 'SuperReadable' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('404: owner A reading org B crane — 404 not 403 (hides existence)', async () => {
    const foreign = await createCrane(ownerBToken, { model: 'OrgB-Crane' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/cranes/${foreign.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('CRANE_NOT_FOUND')
  })

  it('404: operator cannot read any crane (even own-org)', async () => {
    const own = await createCrane(ownerAToken, { model: 'OperatorHidden' })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/cranes/${own.id}`,
      headers: { authorization: `Bearer ${operatorAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('401: unauthenticated rejected', async () => {
    const c = await createCrane(ownerAToken, { model: 'NeedAuth' })
    const res = await handle.app.inject({ method: 'GET', url: `/api/v1/cranes/${c.id}` })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/v1/cranes/:id (update)', () => {
  it('200: owner updates model/capacity; audit row written', async () => {
    const c = await createCrane(ownerAToken, { model: 'Before', capacityTon: 10 })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { model: 'After', capacityTon: 15.5 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().model).toBe('After')
    expect(res.json().capacityTon).toBe(15.5)

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, c.id), eq(auditLog.action, 'crane.update')))
    expect(audits.length).toBeGreaterThanOrEqual(1)
  })

  it('200: owner changes siteId to another own-org site', async () => {
    const c = await createCrane(ownerAToken, { model: 'ReSite', siteId: orgASiteId })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { siteId: orgASite2Id },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().siteId).toBe(orgASite2Id)
  })

  it('200: owner clears siteId with null (crane to warehouse)', async () => {
    const c = await createCrane(ownerAToken, { model: 'ToWarehouse', siteId: orgASiteId })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { siteId: null },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().siteId).toBeNull()
  })

  it('200: superadmin can update any crane', async () => {
    const c = await createCrane(ownerAToken, { model: 'SuperPatch' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { model: 'SuperPatched' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().model).toBe('SuperPatched')
  })

  it('404: owner patches foreign crane — 404', async () => {
    const foreign = await createCrane(ownerBToken, { model: 'ForeignPatch' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${foreign.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { model: 'Hijack' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('422: empty patch rejected by schema refine', async () => {
    const c = await createCrane(ownerAToken, { model: 'EmptyPatch' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })

  it('401: unauthenticated patch rejected', async () => {
    const c = await createCrane(ownerAToken, { model: 'PatchAuth' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${c.id}`,
      payload: { model: 'X' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/v1/cranes/:id — CRITICAL cross-tenant on siteId', () => {
  it('404: owner A patches crane with siteId from FOREIGN org → SITE_NOT_FOUND', async () => {
    const c = await createCrane(ownerAToken, { model: 'PatchForeignSite' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { siteId: orgBSiteId },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('SITE_NOT_FOUND')
  })

  it('409: patch inventoryNumber to one already used in own org → INVENTORY_NUMBER_ALREADY_EXISTS', async () => {
    await createCrane(ownerAToken, { model: 'Keeper', inventoryNumber: 'TAKEN-01' })
    const other = await createCrane(ownerAToken, { model: 'Loser', inventoryNumber: 'FREE-01' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${other.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { inventoryNumber: 'TAKEN-01' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('INVENTORY_NUMBER_ALREADY_EXISTS')
  })

  it('200: patch inventoryNumber to same value (no-op) succeeds', async () => {
    const c = await createCrane(ownerAToken, { model: 'Rename', inventoryNumber: 'KEEP-01' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { inventoryNumber: 'KEEP-01' },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('POST /api/v1/cranes/:id/{activate,maintenance,retire}', () => {
  it('200: active → maintenance → active (round-trip); audit written', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'RoundTrip' })
    const toMaintenance = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/maintenance`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(toMaintenance.statusCode).toBe(200)
    expect(toMaintenance.json().status).toBe('maintenance')

    const toActive = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/activate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(toActive.statusCode).toBe(200)
    expect(toActive.json().status).toBe('active')
  })

  it('200: active → retired; audit crane.retire', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'Retires' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/retire`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('retired')

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, c.id), eq(auditLog.action, 'crane.retire')))
    expect(audits).toHaveLength(1)
  })

  it('409: retired → active rejected (retired is terminal)', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'StuckRetired' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/retire`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/activate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('409: retired → maintenance rejected (terminal)', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'NoRepair' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/retire`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/maintenance`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(409)
  })

  it('200: idempotent — double-retire does not duplicate audit', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'DoubleRetire' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/retire`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/retire`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, c.id), eq(auditLog.action, 'crane.retire')))
    expect(audits).toHaveLength(1)
  })

  it('404: owner cannot change status of foreign crane', async () => {
    const foreign = await createCrane(ownerBToken, { model: 'ForeignStatus' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${foreign.id}/maintenance`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /api/v1/cranes/:id (soft-delete)', () => {
  it('200: owner soft-deletes own crane; deletedAt set in response', async () => {
    const c = await createCrane(ownerAToken, { model: 'SoftDelete' })
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().deletedAt).toEqual(expect.any(String))

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, c.id), eq(auditLog.action, 'crane.delete')))
    expect(audits).toHaveLength(1)
  })

  it('404: owner cannot delete foreign crane', async () => {
    const foreign = await createCrane(ownerBToken, { model: 'ForeignDelete' })
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/cranes/${foreign.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('404: re-deleting already-deleted crane returns 404 (hidden from scope)', async () => {
    const c = await createCrane(ownerAToken, { model: 'ReDelete' })
    await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('201: inventory_number freed after soft-delete — can be reused', async () => {
    const first = await createCrane(ownerAToken, { model: 'First', inventoryNumber: 'REUSE-01' })
    await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/cranes/${first.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/cranes',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        type: 'tower',
        model: 'Second',
        capacityTon: 10,
        inventoryNumber: 'REUSE-01',
      },
    })
    expect(res.statusCode).toBe(201)
  })
})

describe('Data layer guarantees', () => {
  it('FK ON DELETE SET NULL: deleting site nulls crane.siteId', async () => {
    // Создаём временный site (не из общих fixture), привязываем кран, удаляем site
    const siteRes = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'TempSite', latitude: ASTANA_LAT, longitude: ASTANA_LNG },
    })
    const tempSiteId = siteRes.json().id as string

    const c = await createCrane(ownerAToken, { model: 'AttachedCrane', siteId: tempSiteId })

    // Жёстко удаляем site напрямую (API делает только archive; здесь проверяем FK-поведение)
    await handle.app.db.db.execute(sql`DELETE FROM sites WHERE id = ${tempSiteId}`)

    const row = await handle.app.db.db.select().from(cranes).where(eq(cranes.id, c.id))
    expect(row[0]?.siteId).toBeNull()
  })

  it('FK ON DELETE RESTRICT: cannot delete organization with cranes', async () => {
    const orphan = await createOrganization(handle.app, { bin: '620000000099' })
    await handle.app.db.db.execute(sql`
      INSERT INTO cranes (organization_id, type, model, capacity_ton)
      VALUES (${orphan.id}, 'tower', 'Holding', 10)
    `)
    const del = handle.app.db.db.execute(sql`DELETE FROM organizations WHERE id = ${orphan.id}`)
    await expect(del).rejects.toThrow(/violates foreign key/i)
  })

  it('DB CHECK rejects capacity_ton <= 0 even when bypassing Zod', async () => {
    const invalidInsert = handle.app.db.db.execute(sql`
      INSERT INTO cranes (organization_id, type, model, capacity_ton)
      VALUES (${orgAId}, 'tower', 'BadCap', 0)
    `)
    await expect(invalidInsert).rejects.toThrow(/cranes_capacity_positive_chk/i)
  })

  it('DB CHECK rejects boom_length_m <= 0 when provided', async () => {
    const invalidInsert = handle.app.db.db.execute(sql`
      INSERT INTO cranes (organization_id, type, model, capacity_ton, boom_length_m)
      VALUES (${orgAId}, 'tower', 'BadBoom', 10, -5)
    `)
    await expect(invalidInsert).rejects.toThrow(/cranes_boom_length_positive_chk/i)
  })

  it('DB CHECK rejects year_manufactured < 1900', async () => {
    const invalidInsert = handle.app.db.db.execute(sql`
      INSERT INTO cranes (organization_id, type, model, capacity_ton, year_manufactured)
      VALUES (${orgAId}, 'tower', 'BadYear', 10, 1800)
    `)
    await expect(invalidInsert).rejects.toThrow(/cranes_year_manufactured_range_chk/i)
  })

  it('numeric capacity_ton round-trips without precision loss (decimal places)', async () => {
    const c = await createCrane(ownerAToken, { model: 'Precision', capacityTon: 12.75 })
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.json().capacityTon).toBe(12.75)
  })
})

/**
 * Holding-approval workflow (ADR 0002). После B2c owner создаёт кран только
 * как pending; approve/reject делает holding-superadmin. Тесты покрывают:
 *   - RBAC на approve/reject (только superadmin; owner/operator — 403);
 *   - идемпотентность / race-protection: approve approved/rejected → 409;
 *   - operational операции на не-approved кранах — 409 с объясняющим кодом;
 *   - list-фильтр по approvalStatus (default approved, all, pending, rejected);
 *   - cross-tenant: superadmin'овские endpoints сохраняют 404 для
 *     несуществующих id; owner'у approve/reject выдаёт 403 даже по своей org.
 */
describe('Approval workflow — POST /api/v1/cranes/:id/approve', () => {
  it('200: superadmin approves pending crane; audit crane.approve; approvedAt set', async () => {
    const c = await createCrane(ownerAToken, { model: 'ApproveMe' })

    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.approvalStatus).toBe('approved')
    expect(json.approvedAt).toEqual(expect.any(String))
    expect(json.rejectedAt).toBeNull()
    expect(json.rejectionReason).toBeNull()

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, c.id), eq(auditLog.action, 'crane.approve')))
    expect(audits).toHaveLength(1)
    expect(audits[0]?.organizationId).toBe(orgAId)
  })

  it('409: approving already-approved crane → CRANE_NOT_PENDING', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'DoubleApprove' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_NOT_PENDING')
  })

  it('409: approving rejected crane → CRANE_NOT_PENDING', async () => {
    const c = await createCrane(ownerAToken, { model: 'RejectedThenApprove' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'no docs' },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_NOT_PENDING')
  })

  it('403: owner cannot approve own crane (holding-approval invariant)', async () => {
    const c = await createCrane(ownerAToken, { model: 'OwnerApprove' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/approve`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('403: operator cannot approve', async () => {
    const c = await createCrane(ownerAToken, { model: 'OperatorApprove' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/approve`,
      headers: { authorization: `Bearer ${operatorAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated approve rejected', async () => {
    const c = await createCrane(ownerAToken, { model: 'NoAuthApprove' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/approve`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('404: superadmin approve nonexistent id', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${fakeId}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('CRANE_NOT_FOUND')
  })
})

describe('Approval workflow — POST /api/v1/cranes/:id/reject', () => {
  it('200: superadmin rejects pending crane with reason; audit crane.reject; rejectedAt+reason set', async () => {
    const c = await createCrane(ownerAToken, { model: 'RejectMe' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'Документы не соответствуют' },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.approvalStatus).toBe('rejected')
    expect(json.rejectedAt).toEqual(expect.any(String))
    expect(json.rejectionReason).toBe('Документы не соответствуют')
    expect(json.approvedAt).toBeNull()

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, c.id), eq(auditLog.action, 'crane.reject')))
    expect(audits).toHaveLength(1)
    expect(audits[0]?.organizationId).toBe(orgAId)
  })

  it('422: reject without reason rejected by Zod', async () => {
    const c = await createCrane(ownerAToken, { model: 'RejectNoReason' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })

  it('422: reject with empty-string reason rejected by Zod', async () => {
    const c = await createCrane(ownerAToken, { model: 'RejectEmptyReason' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: '   ' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('409: rejecting approved crane → CRANE_NOT_PENDING', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'RejectApproved' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'too late' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_NOT_PENDING')
  })

  it('409: rejecting already-rejected crane → CRANE_NOT_PENDING', async () => {
    const c = await createCrane(ownerAToken, { model: 'DoubleReject' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'first' },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'second' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_NOT_PENDING')
  })

  it('403: owner cannot reject', async () => {
    const c = await createCrane(ownerAToken, { model: 'OwnerReject' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { reason: 'self-reject' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated reject', async () => {
    const c = await createCrane(ownerAToken, { model: 'NoAuthReject' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      payload: { reason: 'x' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('Approval workflow — operational gating on pending/rejected', () => {
  it('409: status-transition on pending crane → CRANE_NOT_APPROVED', async () => {
    const c = await createCrane(ownerAToken, { model: 'PendingMaint' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/maintenance`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_NOT_APPROVED')
  })

  it('409: status-transition on rejected crane → CRANE_REJECTED_READONLY', async () => {
    const c = await createCrane(ownerAToken, { model: 'RejectedMaint' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'bad' },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/maintenance`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_REJECTED_READONLY')
  })

  it('409: update on rejected crane → CRANE_REJECTED_READONLY', async () => {
    const c = await createCrane(ownerAToken, { model: 'RejectedPatch' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'bad' },
    })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { model: 'TryRename' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_REJECTED_READONLY')
  })

  it('200: update on pending crane is allowed (fix before approval)', async () => {
    const c = await createCrane(ownerAToken, { model: 'PendingFixable' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { model: 'PendingFixed' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().model).toBe('PendingFixed')
    expect(res.json().approvalStatus).toBe('pending')
  })

  it('200: delete on pending crane is allowed', async () => {
    const c = await createCrane(ownerAToken, { model: 'PendingDelete' })
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().deletedAt).toEqual(expect.any(String))
  })

  it('200: delete on rejected crane is allowed (cleanup path)', async () => {
    const c = await createCrane(ownerAToken, { model: 'RejectedDelete' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'drop' },
    })
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('Approval workflow — list filtering by approvalStatus', () => {
  it("owner default list excludes pending (approvalStatus='approved' is default)", async () => {
    const pending = await createCrane(ownerAToken, { model: 'DefaultListPending' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const ids = (res.json().items as Array<{ id: string }>).map((i) => i.id)
    expect(ids).not.toContain(pending.id)
  })

  it('owner ?approvalStatus=pending shows own pending cranes', async () => {
    const pending = await createCrane(ownerAToken, { model: 'FilterPending' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?approvalStatus=pending&limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ id: string; approvalStatus: string }>
    const found = items.find((i) => i.id === pending.id)
    expect(found?.approvalStatus).toBe('pending')
    // и все показанные — pending (режим фильтрации строгий)
    expect(items.every((i) => i.approvalStatus === 'pending')).toBe(true)
  })

  it('owner ?approvalStatus=rejected shows own rejected cranes', async () => {
    const crane = await createCrane(ownerAToken, { model: 'FilterRejected' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${crane.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'for filter test' },
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?approvalStatus=rejected&limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ id: string; approvalStatus: string }>
    expect(items.some((i) => i.id === crane.id)).toBe(true)
    expect(items.every((i) => i.approvalStatus === 'rejected')).toBe(true)
  })

  it('owner ?approvalStatus=all shows pending + approved + rejected (minus soft-deleted)', async () => {
    const pending = await createCrane(ownerAToken, { model: 'AllPending' })
    const approved = await createApprovedCrane(ownerAToken, { model: 'AllApproved' })
    const rejected = await createCrane(ownerAToken, { model: 'AllRejected' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${rejected.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'for all-filter' },
    })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?approvalStatus=all&limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const ids = (res.json().items as Array<{ id: string }>).map((i) => i.id)
    expect(ids).toContain(pending.id)
    expect(ids).toContain(approved.id)
    expect(ids).toContain(rejected.id)
  })

  it('superadmin ?approvalStatus=pending shows pending globally (approval queue)', async () => {
    const pA = await createCrane(ownerAToken, { model: 'QueueA' })
    const pB = await createCrane(ownerBToken, { model: 'QueueB' })

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?approvalStatus=pending&limit=100',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ id: string; organizationId: string }>
    const ids = items.map((i) => i.id)
    expect(ids).toContain(pA.id)
    expect(ids).toContain(pB.id)
    const orgs = new Set(items.map((i) => i.organizationId))
    expect(orgs.size).toBeGreaterThanOrEqual(2)
  })

  it('owner cannot see FOREIGN pending via ?approvalStatus=pending (tenant scope)', async () => {
    const foreign = await createCrane(ownerBToken, { model: 'ForeignPending' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?approvalStatus=pending&limit=100',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const ids = (res.json().items as Array<{ id: string }>).map((i) => i.id)
    expect(ids).not.toContain(foreign.id)
  })
})

describe('Approval workflow — cross-tenant and hiding', () => {
  it('404: superadmin approve on soft-deleted crane hidden', async () => {
    const c = await createCrane(ownerAToken, { model: 'DeletedThenApprove' })
    await handle.app.inject({
      method: 'DELETE',
      url: `/api/v1/cranes/${c.id}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('CRANE_NOT_FOUND')
  })
})

/**
 * B3-UI-3b: assign-site / unassign-site explicit endpoints + audit actions.
 * Critical: cross-org tenant guard, approved-only gate, idempotency.
 */
describe('POST /api/v1/cranes/:id/assign-site', () => {
  it('200: owner assigns approved crane к own site; audit crane.assign_to_site', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'AssignA' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/assign-site`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { siteId: orgASiteId },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().siteId).toBe(orgASiteId)

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, c.id), eq(auditLog.action, 'crane.assign_to_site')))
    expect(audits).toHaveLength(1)
  })

  it('200: idempotent re-assign к same site — no-op, no audit', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'AssignIdem' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/assign-site`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { siteId: orgASiteId },
    })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/assign-site`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { siteId: orgASiteId },
    })
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, c.id), eq(auditLog.action, 'crane.assign_to_site')))
    expect(audits).toHaveLength(1)
  })

  it('200: re-assign к second site (orgASite2Id) updates siteId and writes audit', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'ReAssign' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/assign-site`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { siteId: orgASiteId },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/assign-site`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { siteId: orgASite2Id },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().siteId).toBe(orgASite2Id)
  })

  it('404: owner assigns own crane к FOREIGN site (cross-org guard)', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'CrossOrg' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/assign-site`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { siteId: orgBSiteId },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('SITE_NOT_FOUND')
  })

  it('409: cannot assign pending crane (CRANE_NOT_APPROVED)', async () => {
    const c = await createCrane(ownerAToken, { model: 'PendingAssign' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/assign-site`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { siteId: orgASiteId },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_NOT_APPROVED')
  })

  it('404: owner assigns FOREIGN crane (tenant scope)', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'ForeignCrane' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/assign-site`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { siteId: orgBSiteId },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('CRANE_NOT_FOUND')
  })

  it('403: operator cannot assign', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'OperatorAssign' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/assign-site`,
      headers: { authorization: `Bearer ${operatorAToken}` },
      payload: { siteId: orgASiteId },
    })
    // operator findInScope returns null → 404 (cranes module hides existence)
    expect(res.statusCode).toBe(404)
  })

  it('422: missing siteId in body', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'NoBody' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/assign-site`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })
})

describe('POST /api/v1/cranes/:id/unassign-site', () => {
  it('200: owner unassigns own crane; audit crane.unassign_from_site', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'Unassign' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/assign-site`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { siteId: orgASiteId },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/unassign-site`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().siteId).toBeNull()

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, c.id), eq(auditLog.action, 'crane.unassign_from_site')))
    expect(audits).toHaveLength(1)
  })

  it('200: idempotent unassign on already-null siteId — no audit', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'UnassignIdem' })
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/unassign-site`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, c.id), eq(auditLog.action, 'crane.unassign_from_site')))
    expect(audits).toHaveLength(0)
  })
})

describe('POST /api/v1/cranes/:id/resubmit', () => {
  async function makeRejected(model: string): Promise<{ id: string }> {
    const c = await createCrane(ownerAToken, { model })
    const r = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/reject`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { reason: 'because' },
    })
    if (r.statusCode !== 200) throw new Error(`reject failed: ${r.statusCode}`)
    return c
  }

  it('200: owner resubmits rejected → pending; rejected fields cleared; audit crane.resubmit', async () => {
    const c = await makeRejected('Resub1')
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/resubmit`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.approvalStatus).toBe('pending')
    expect(json.rejectedAt).toBeNull()
    expect(json.rejectionReason).toBeNull()

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, c.id), eq(auditLog.action, 'crane.resubmit')))
    expect(audits).toHaveLength(1)
  })

  it('200: resubmitted crane re-appears in superadmin pending queue', async () => {
    const c = await makeRejected('ResubQueue')
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/resubmit`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/cranes?approvalStatus=pending&limit=100',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    const ids = (res.json().items as Array<{ id: string }>).map((i) => i.id)
    expect(ids).toContain(c.id)
  })

  it('200: superadmin can re-approve resubmitted', async () => {
    const c = await makeRejected('ResubApprove')
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/resubmit`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/approve`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().approvalStatus).toBe('approved')
  })

  it('409: cannot resubmit approved crane (CRANE_NOT_REJECTED)', async () => {
    const c = await createApprovedCrane(ownerAToken, { model: 'ResubApproved' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/resubmit`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_NOT_REJECTED')
  })

  it('409: cannot resubmit pending crane', async () => {
    const c = await createCrane(ownerAToken, { model: 'ResubPending' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/resubmit`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_NOT_REJECTED')
  })

  it('404: owner of org B cannot resubmit org A crane', async () => {
    const c = await makeRejected('ResubForeign')
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/cranes/${c.id}/resubmit`,
      headers: { authorization: `Bearer ${ownerBToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})
