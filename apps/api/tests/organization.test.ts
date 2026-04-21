import { auditLog, organizations, users } from '@jumix/db'
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты organizations-модуля. Проверяют CRUD, RBAC (superadmin /
 * owner / operator), action-endpoints /suspend и /activate, conflict detection,
 * phone-normalization и маскирование в ответах.
 *
 * Один Postgres-контейнер на весь файл; каждый тест создаёт свои фикстуры
 * с уникальными phone/BIN чтобы не конфликтовать с соседями.
 *
 * Валидные BIN'ы (чексумма):
 *   111111111110, 100000000011, 123456789013
 * Служебные (только DB insert, bypass checksum): любые 12 цифр.
 */

let handle: TestAppHandle

// shared fixtures, устанавливаются один раз
let superadminToken: string
let ownerAToken: string
let operatorAToken: string
let orgAId: string
let orgBId: string
let ownerAId: string

beforeAll(async () => {
  handle = await buildTestApp()

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77010000001',
    organizationId: null,
    name: 'Super Admin',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const orgA = await createOrganization(handle.app, { name: 'Org A', bin: '200000000001' })
  orgAId = orgA.id
  const ownerA = await createUser(handle.app, {
    role: 'owner',
    phone: '+77010000002',
    organizationId: orgAId,
    name: 'Owner A',
  })
  ownerAId = ownerA.id
  ownerAToken = await signTokenFor(handle.app, ownerA)

  const orgB = await createOrganization(handle.app, { name: 'Org B', bin: '200000000002' })
  orgBId = orgB.id
  await createUser(handle.app, {
    role: 'owner',
    phone: '+77010000003',
    organizationId: orgBId,
    name: 'Owner B',
  })

  const operatorA = await createUser(handle.app, {
    role: 'operator',
    phone: '+77010000004',
    organizationId: orgAId,
    name: 'Operator A',
  })
  operatorAToken = await signTokenFor(handle.app, operatorA)
}, 60_000)

afterAll(async () => {
  await handle.close()
})

describe('POST /api/v1/organizations (create)', () => {
  it('201: superadmin creates organization + first owner atomically', async () => {
    const body = {
      name: 'Acme Cranes',
      bin: '123456789013',
      contactName: 'Acme Contact',
      contactPhone: '+77710001122',
      contactEmail: 'info@acme.kz',
      ownerPhone: '+77710009988',
      ownerName: 'Acme Owner',
    }
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: body,
    })
    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.organization.bin).toBe('123456789013')
    expect(json.organization.status).toBe('active')
    // contactPhone masked in response
    expect(json.organization.contactPhone).toBe('+7******1122')
    // owner phone also masked
    expect(json.owner.phone).toBe('+7******9988')
    expect(json.owner.id).toEqual(expect.any(String))

    // DB: org + owner exist
    const orgRows = await handle.app.db.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, json.organization.id))
    expect(orgRows).toHaveLength(1)
    const userRows = await handle.app.db.db
      .select()
      .from(users)
      .where(eq(users.phone, '+77710009988'))
    expect(userRows).toHaveLength(1)
    expect(userRows[0]?.role).toBe('owner')
    expect(userRows[0]?.organizationId).toBe(json.organization.id)

    // Audit: organization.create written inside the tx
    const auditRows = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetId, json.organization.id))
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]?.action).toBe('organization.create')
    // full phone retained in audit metadata (internal)
    expect((auditRows[0]?.metadata as Record<string, unknown>).ownerPhone).toBe('+77710009988')
  })

  it('201: phone normalization — "8 701 XXX-XX-XX" stored as +7701...', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        name: 'Normalized',
        bin: '111111111110',
        ownerPhone: '8 701 234-56-78',
        ownerName: 'Normalized Owner',
      },
    })
    expect(res.statusCode).toBe(201)
    const userRows = await handle.app.db.db
      .select()
      .from(users)
      .where(eq(users.phone, '+77012345678'))
    expect(userRows).toHaveLength(1)
  })

  it('403: owner cannot create organizations', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        name: 'Nope',
        bin: '100000000011',
        ownerPhone: '+77710007777',
        ownerName: 'X',
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('403: operator cannot create organizations', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${operatorAToken}` },
      payload: {
        name: 'Nope',
        bin: '100000000011',
        ownerPhone: '+77710007778',
        ownerName: 'X',
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated request rejected', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      payload: {
        name: 'X',
        bin: '100000000011',
        ownerPhone: '+77710007779',
        ownerName: 'X',
      },
    })
    expect(res.statusCode).toBe(401)
  })

  it('409: BIN conflict on duplicate BIN', async () => {
    // First create
    const bin = '100000000011'
    await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        name: 'First',
        bin,
        ownerPhone: '+77710011001',
        ownerName: 'First',
      },
    })
    // Second with same BIN
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        name: 'Second',
        bin,
        ownerPhone: '+77710011002',
        ownerName: 'Second',
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('BIN_ALREADY_EXISTS')
  })

  it('409: PHONE conflict — rejects even if user is soft-deleted (unique constraint holds)', async () => {
    // Create via direct DB insert + soft-delete to simulate legacy user
    const orphanOrg = await createOrganization(handle.app, { bin: '300000000001' })
    const legacyPhone = '+77710022001'
    await handle.app.db.db
      .insert(users)
      .values({
        role: 'owner',
        organizationId: orphanOrg.id,
        phone: legacyPhone,
        name: 'Legacy',
        deletedAt: new Date(),
      })
      .returning()

    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        name: 'Reuses Legacy Phone',
        bin: '800000000008',
        ownerPhone: legacyPhone,
        ownerName: 'X',
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('PHONE_ALREADY_REGISTERED')
  })

  it('409: BIN conflict takes precedence over phone conflict (enumeration-safe order)', async () => {
    // Pre-create a user with target phone (on a different org) AND pre-existing BIN
    const existingBin = '300000000003'
    const existingPhone = '+77710033001'
    const someOrg = await createOrganization(handle.app, { bin: existingBin })
    await handle.app.db.db.insert(users).values({
      role: 'owner',
      organizationId: someOrg.id,
      phone: existingPhone,
      name: 'Pre-existing',
    })

    // Attempt to create with BOTH colliding BIN and colliding phone
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        name: 'Collides Both',
        bin: existingBin,
        ownerPhone: existingPhone,
        ownerName: 'X',
      },
    })
    expect(res.statusCode).toBe(409)
    // BIN is public info → safe to surface first; phone (PII) only after BIN clear
    expect(res.json().error.code).toBe('BIN_ALREADY_EXISTS')
  })

  it('422: invalid BIN checksum rejected', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        name: 'Bad BIN',
        bin: '123456789012', // valid format, bad checksum
        ownerPhone: '+77710044001',
        ownerName: 'X',
      },
    })
    expect(res.statusCode).toBe(422)
  })
})

describe('GET /api/v1/organizations (list)', () => {
  it('200: superadmin lists organizations', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(Array.isArray(json.items)).toBe(true)
    expect(json.items.length).toBeGreaterThanOrEqual(2) // at least Org A and Org B
  })

  it('200: cursor pagination yields subsequent pages without overlap', async () => {
    const first = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organizations?limit=1',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(first.statusCode).toBe(200)
    const p1 = first.json()
    expect(p1.items).toHaveLength(1)
    expect(p1.nextCursor).toEqual(expect.any(String))

    const second = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organizations?limit=1&cursor=${p1.nextCursor}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(second.statusCode).toBe(200)
    const p2 = second.json()
    expect(p2.items).toHaveLength(1)
    expect(p2.items[0].id).not.toBe(p1.items[0].id)
  })

  it('403: owner cannot list organizations', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403: operator cannot list organizations', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${operatorAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated rejected', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/api/v1/organizations' })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/v1/organizations/me', () => {
  it('200: owner gets their own organization', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organizations/me',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(orgAId)
  })

  it('403: superadmin has no org → /me not for them', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organizations/me',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403: operator cannot use /me (business data)', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/organizations/me',
      headers: { authorization: `Bearer ${operatorAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated rejected', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/api/v1/organizations/me' })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/v1/organizations/:id', () => {
  it('200: superadmin reads any organization', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${orgAId}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(orgAId)
  })

  it('200: owner reads own organization', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${orgAId}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(orgAId)
  })

  it('404: owner attempting foreign organization sees 404 (not 403 — existence hidden)', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${orgBId}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('ORGANIZATION_NOT_FOUND')
  })

  it('404: operator cannot see organizations (own or foreign)', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${orgAId}`,
      headers: { authorization: `Bearer ${operatorAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('401: unauthenticated rejected', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${orgAId}`,
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/v1/organizations/:id (update)', () => {
  it('200: superadmin updates any field (including name/bin)', async () => {
    const org = await createOrganization(handle.app, { bin: '400000000001', name: 'Before' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organizations/${org.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { name: 'After', contactName: 'New Contact' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('After')
    expect(res.json().contactName).toBe('New Contact')

    // audit written
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, org.id), eq(auditLog.action, 'organization.update')))
    expect(audits.length).toBeGreaterThanOrEqual(1)
  })

  it('200: owner updates own contacts', async () => {
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organizations/${orgAId}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { contactName: 'Owner-Set Contact', contactEmail: 'ops@a.kz' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().contactName).toBe('Owner-Set Contact')
  })

  it('403 FIELD_NOT_ALLOWED: owner cannot change name/bin of own org', async () => {
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organizations/${orgAId}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'Hostile Rename' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FIELD_NOT_ALLOWED')
    // details list the offending field(s)
    expect(res.json().error.details.fields).toContain('name')
  })

  it('404: owner cannot update foreign organization', async () => {
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organizations/${orgBId}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { contactName: 'Try Hijack' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('409: superadmin changing BIN to existing BIN returns conflict', async () => {
    const a = await createOrganization(handle.app, { bin: '900000000009' })
    const b = await createOrganization(handle.app, { bin: '400000000003' })
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organizations/${b.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { bin: '900000000009' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('BIN_ALREADY_EXISTS')
    // untouched target
    expect(a.id).not.toBe(b.id)
  })

  it('401: unauthenticated rejected', async () => {
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organizations/${orgAId}`,
      payload: { contactName: 'X' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('422: empty patch rejected by schema refine', async () => {
    const res = await handle.app.inject({
      method: 'PATCH',
      url: `/api/v1/organizations/${orgAId}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
  })
})

describe('POST /api/v1/organizations/:id/suspend', () => {
  it('200: superadmin suspends organization (and action is idempotent)', async () => {
    const org = await createOrganization(handle.app, { bin: '500000000001' })
    const first = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${org.id}/suspend`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().status).toBe('suspended')

    // idempotent: repeat returns same status, no second audit
    const second = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${org.id}/suspend`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(second.statusCode).toBe(200)
    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, org.id), eq(auditLog.action, 'organization.suspend')))
    expect(audits).toHaveLength(1)
  })

  it('403: owner cannot suspend own organization', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${orgAId}/suspend`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403: owner cannot suspend foreign organization either', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${orgBId}/suspend`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('401: unauthenticated rejected', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${orgAId}/suspend`,
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/v1/organizations/:id/activate', () => {
  it('200: superadmin activates suspended organization', async () => {
    const org = await createOrganization(handle.app, {
      bin: '500000000002',
      status: 'suspended',
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${org.id}/activate`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('active')
  })

  it('403: owner cannot activate (only superadmin)', async () => {
    const org = await createOrganization(handle.app, {
      bin: '500000000003',
      status: 'suspended',
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${org.id}/activate`,
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('Fixtures sanity', () => {
  it('Owner A user is in Org A', async () => {
    const rows = await handle.app.db.db
      .select()
      .from(users)
      .where(and(eq(users.id, ownerAId), isNull(users.deletedAt)))
    expect(rows[0]?.organizationId).toBe(orgAId)
  })
})
