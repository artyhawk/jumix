import { auditLog } from '@jumix/db'
import { desc } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты GET /api/v1/audit/recent (B3-UI-2d).
 *
 *   - 401 без токена
 *   - 403 owner/operator
 *   - 200 superadmin + enriched actor/organization via LEFT JOIN
 *   - Ordering DESC by createdAt
 *   - Limit defaults (50) + validation (0/101 → 400)
 *   - Null-actor (system cron) / null-organization (platform event) preserved
 *   - Metadata preserved as-is
 *
 * BIN-серия 66xxxx (не пересекается с 60/61/62/63/64/65).
 */

let handle: TestAppHandle

let superadminToken: string
let ownerToken: string
let operatorToken: string
let superadminId: string
let orgId: string

beforeAll(async () => {
  handle = await buildTestApp()

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77160000001',
    organizationId: null,
    name: 'Super',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)
  superadminId = superadmin.id

  const org = await createOrganization(handle.app, {
    name: 'Audit Org',
    bin: '660000000001',
  })
  orgId = org.id

  const owner = await createUser(handle.app, {
    role: 'owner',
    phone: '+77160000002',
    organizationId: org.id,
    name: 'Owner',
  })
  ownerToken = await signTokenFor(handle.app, owner)

  const operator = await createUser(handle.app, {
    role: 'operator',
    phone: '+77160000003',
    organizationId: null,
    name: 'Operator',
  })
  operatorToken = await signTokenFor(handle.app, operator)
}, 60_000)

afterAll(async () => {
  await handle.close()
})

describe('GET /api/v1/audit/recent — authorization', () => {
  it('401: no token', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/api/v1/audit/recent' })
    expect(res.statusCode).toBe(401)
  })

  it('403: owner cannot read audit log', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/audit/recent',
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('403: operator cannot read audit log', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/audit/recent',
      headers: { authorization: `Bearer ${operatorToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/v1/audit/recent — content', () => {
  it('200: superadmin gets events with enriched actor + organization', async () => {
    // Fixture: superadmin action + system cron action + platform-level event.
    await handle.app.db.db.insert(auditLog).values([
      {
        actorUserId: superadminId,
        actorRole: 'superadmin',
        action: 'organization.create',
        targetType: 'organization',
        targetId: orgId,
        organizationId: orgId,
        metadata: { name: 'Audit Org' },
        createdAt: new Date('2026-04-20T10:00:00Z'),
      },
      {
        actorUserId: null,
        actorRole: 'system',
        action: 'license.warning_sent',
        targetType: 'crane_profile',
        targetId: null,
        organizationId: null,
        metadata: { variant: '30d', expiresAt: '2026-05-20T00:00:00Z' },
        createdAt: new Date('2026-04-21T02:00:00Z'),
      },
      {
        actorUserId: null,
        actorRole: null,
        action: 'registration.start',
        targetType: null,
        targetId: null,
        organizationId: null,
        metadata: { phone: '+77010000000' },
        createdAt: new Date('2026-04-19T12:00:00Z'),
      },
    ])

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/audit/recent?limit=10',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      events: {
        id: string
        actor: { userId: string | null; name: string | null; role: string | null }
        action: string
        target: { type: string | null; id: string | null }
        organizationId: string | null
        organizationName: string | null
        metadata: Record<string, unknown>
        ipAddress: string | null
        createdAt: string
      }[]
    }
    expect(Array.isArray(body.events)).toBe(true)
    expect(body.events.length).toBeGreaterThanOrEqual(3)

    const superEvt = body.events.find((e) => e.action === 'organization.create')
    expect(superEvt).toBeDefined()
    expect(superEvt?.actor.userId).toBe(superadminId)
    expect(superEvt?.actor.name).toBe('Super')
    expect(superEvt?.actor.role).toBe('superadmin')
    expect(superEvt?.organizationId).toBe(orgId)
    expect(superEvt?.organizationName).toBe('Audit Org')
    expect(superEvt?.metadata).toEqual({ name: 'Audit Org' })

    const systemEvt = body.events.find((e) => e.action === 'license.warning_sent')
    expect(systemEvt).toBeDefined()
    expect(systemEvt?.actor.userId).toBeNull()
    expect(systemEvt?.actor.name).toBeNull()
    expect(systemEvt?.actor.role).toBe('system')
    expect(systemEvt?.organizationId).toBeNull()
    expect(systemEvt?.organizationName).toBeNull()
    expect(systemEvt?.metadata).toEqual({
      variant: '30d',
      expiresAt: '2026-05-20T00:00:00Z',
    })

    const regEvt = body.events.find((e) => e.action === 'registration.start')
    expect(regEvt?.target.type).toBeNull()
    expect(regEvt?.target.id).toBeNull()
    expect(regEvt?.actor.role).toBeNull()
  })

  it('orders events DESC by createdAt', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/audit/recent?limit=100',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const events = (res.json() as { events: { createdAt: string }[] }).events
    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1]!.createdAt).getTime()
      const curr = new Date(events[i]!.createdAt).getTime()
      expect(prev).toBeGreaterThanOrEqual(curr)
    }
    // Cross-check с таблицей напрямую — порядок идентичен.
    const raw = await handle.app.db.db
      .select({ createdAt: auditLog.createdAt })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(events.length)
    expect(events.map((e) => new Date(e.createdAt).toISOString())).toEqual(
      raw.map((r) => r.createdAt.toISOString()),
    )
  })

  it('defaults to 50 when limit is omitted', async () => {
    // Вставим >50 событий чтобы увидеть cap на 50.
    const rows = Array.from({ length: 60 }, (_, i) => ({
      actorUserId: superadminId,
      actorRole: 'superadmin',
      action: 'test.default_limit',
      targetType: 'test',
      targetId: null,
      organizationId: null,
      metadata: { i },
      createdAt: new Date(Date.UTC(2025, 0, 1, 0, i, 0)),
    }))
    await handle.app.db.db.insert(auditLog).values(rows)

    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/audit/recent',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const events = (res.json() as { events: unknown[] }).events
    expect(events.length).toBe(50)
  })

  it('422: limit=0 fails zod validation', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/audit/recent?limit=0',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('422: limit=101 fails zod validation', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/audit/recent?limit=101',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(422)
  })
})
