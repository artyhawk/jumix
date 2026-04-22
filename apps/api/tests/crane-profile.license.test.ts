import { auditLog, craneProfiles } from '@jumix/db'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты license flow (ADR 0005). Покрывает:
 *
 *   POST /api/v1/crane-profiles/me/license/upload-url
 *   POST /api/v1/crane-profiles/me/license/confirm
 *   POST /api/v1/crane-profiles/:id/license/upload-url  (admin)
 *   POST /api/v1/crane-profiles/:id/license/confirm     (admin)
 *
 * self-path только для approved profile (409 на pending/rejected), admin-path
 * работает и с pending (onboarding-override). Confirm проверяет:
 *  - prefix match (defend against foreign-profile injection)
 *  - object реально существует (head)
 *  - content-type из whitelist
 *  - size ≤ 10MB
 * После confirm — licenseVersion инкрементируется, warning-flags сбрасываются.
 *
 * BIN-серия 67xxxx (не пересекается с другими).
 */

const DAY = 24 * 60 * 60 * 1000

let handle: TestAppHandle
let superadminToken: string
let ownerToken: string
let orgId: string

beforeAll(async () => {
  handle = await buildTestApp()

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77170000000',
    organizationId: null,
    name: 'Super',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const org = await createOrganization(handle.app, { name: 'License Org', bin: '670000000001' })
  orgId = org.id
  const owner = await createUser(handle.app, {
    role: 'owner',
    phone: '+77170000001',
    organizationId: orgId,
    name: 'Owner',
  })
  ownerToken = await signTokenFor(handle.app, owner)
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

let iinSeq = 700_000
let phoneSeq = 500
function nextIin(): string {
  iinSeq += 1
  return iin(iinSeq)
}
function nextPhone(): string {
  phoneSeq += 1
  return `+7717${String(phoneSeq).padStart(7, '0')}`
}

async function createProfile(options: {
  approvalStatus?: 'pending' | 'approved' | 'rejected'
  licenseVersion?: number
  licenseKey?: string | null
  licenseExpiresAt?: Date | null
}): Promise<{ userId: string; profileId: string; accessToken: string }> {
  const user = await createUser(handle.app, {
    role: 'operator',
    phone: nextPhone(),
    organizationId: null,
    name: 'Lic Op',
  })
  const approvalStatus = options.approvalStatus ?? 'approved'
  const rows = await handle.app.db.db
    .insert(craneProfiles)
    .values({
      userId: user.id,
      firstName: 'Lic',
      lastName: 'Op',
      iin: nextIin(),
      approvalStatus,
      approvedAt: approvalStatus === 'approved' ? new Date() : null,
      rejectedAt: approvalStatus === 'rejected' ? new Date() : null,
      rejectionReason: approvalStatus === 'rejected' ? 'test' : null,
      licenseKey: options.licenseKey ?? null,
      licenseExpiresAt: options.licenseExpiresAt ?? null,
      licenseVersion: options.licenseVersion ?? 0,
    })
    .returning({ id: craneProfiles.id })
  const profileId = rows[0]?.id
  if (!profileId) throw new Error('profile insert failed')
  const accessToken = await signTokenFor(handle.app, user)
  return { userId: user.id, profileId, accessToken }
}

async function writeFakeObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const storage = handle.app.storage as unknown as {
    putObjectRaw?: (k: string, b: Buffer, ct: string) => void
  }
  if (typeof storage.putObjectRaw !== 'function') {
    throw new Error('expected InMemoryStorageClient')
  }
  storage.putObjectRaw(key, body, contentType)
}

function futureDate(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString()
}

describe('POST /me/license/upload-url', () => {
  it('401 without token', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/upload-url',
      payload: { contentType: 'application/pdf', filename: 'license.pdf' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('403 for owner (operator-only /me)', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/upload-url',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { contentType: 'application/pdf', filename: 'license.pdf' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403 for superadmin (must use /:id path)', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/upload-url',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { contentType: 'application/pdf', filename: 'license.pdf' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('404 for operator without profile', async () => {
    const orphan = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: null,
    })
    const token = await signTokenFor(handle.app, orphan)
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/upload-url',
      headers: { authorization: `Bearer ${token}` },
      payload: { contentType: 'application/pdf', filename: 'license.pdf' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('CRANE_PROFILE_NOT_FOUND')
  })

  it('409 for pending profile (must be approved first)', async () => {
    const { accessToken } = await createProfile({ approvalStatus: 'pending' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/upload-url',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { contentType: 'application/pdf', filename: 'license.pdf' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CRANE_PROFILE_NOT_APPROVED')
  })

  it('409 for rejected profile', async () => {
    const { accessToken } = await createProfile({ approvalStatus: 'rejected' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/upload-url',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { contentType: 'application/pdf', filename: 'license.pdf' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('422 for invalid content-type (via zod enum)', async () => {
    const { accessToken } = await createProfile({ approvalStatus: 'approved' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/upload-url',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { contentType: 'image/webp', filename: 'license.webp' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('200 for approved profile — returns key with v{nextVersion}', async () => {
    const { accessToken, profileId } = await createProfile({
      approvalStatus: 'approved',
      licenseVersion: 0,
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/upload-url',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { contentType: 'application/pdf', filename: 'license.pdf' },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json() as {
      uploadUrl: string
      key: string
      version: number
      headers: Record<string, string>
      expiresAt: string
    }
    expect(json.key.startsWith(`crane-profiles/${profileId}/license/v1/`)).toBe(true)
    expect(json.version).toBe(1)
    expect(typeof json.uploadUrl).toBe('string')
    expect(typeof json.expiresAt).toBe('string')
  })

  it('200 — version=2 after an already-uploaded license (increment)', async () => {
    const { accessToken, profileId } = await createProfile({
      approvalStatus: 'approved',
      licenseVersion: 1,
      licenseKey: 'crane-profiles/fake/license/v1/a.pdf',
      licenseExpiresAt: new Date(Date.now() + 60 * DAY),
    })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/upload-url',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { contentType: 'application/pdf', filename: 'renew.pdf' },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json() as { key: string; version: number }
    expect(json.key.startsWith(`crane-profiles/${profileId}/license/v2/`)).toBe(true)
    expect(json.version).toBe(2)
  })
})

describe('POST /me/license/confirm', () => {
  it('401 without token', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/confirm',
      payload: { key: 'x', expiresAt: futureDate(365) },
    })
    expect(res.statusCode).toBe(401)
  })

  it('409 for pending profile', async () => {
    const { accessToken } = await createProfile({ approvalStatus: 'pending' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        key: 'crane-profiles/fake/license/v1/x.pdf',
        expiresAt: futureDate(365),
      },
    })
    expect(res.statusCode).toBe(409)
  })

  it('422 expiresAt в прошлом', async () => {
    const { accessToken } = await createProfile({ approvalStatus: 'approved' })
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        key: 'crane-profiles/fake/license/v1/x.pdf',
        expiresAt: new Date(Date.now() - DAY).toISOString(),
      },
    })
    expect(res.statusCode).toBe(422)
  })

  it('400 key mismatch: чужой profile prefix', async () => {
    const a = await createProfile({ approvalStatus: 'approved' })
    const b = await createProfile({ approvalStatus: 'approved' })
    const foreignKey = `crane-profiles/${b.profileId}/license/v1/mine.pdf`
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/confirm',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { key: foreignKey, expiresAt: futureDate(365) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('LICENSE_KEY_MISMATCH')
  })

  it('400 key mismatch: свой profile но не v{expected}', async () => {
    const { accessToken, profileId } = await createProfile({
      approvalStatus: 'approved',
      licenseVersion: 0,
    })
    // должен быть v1 (0+1), а клиент шлёт v99
    const wrongVersion = `crane-profiles/${profileId}/license/v99/x.pdf`
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { key: wrongVersion, expiresAt: futureDate(365) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('LICENSE_KEY_MISMATCH')
  })

  it('400 LICENSE_NOT_UPLOADED если объекта нет в storage', async () => {
    const { accessToken, profileId } = await createProfile({
      approvalStatus: 'approved',
      licenseVersion: 0,
    })
    const key = `crane-profiles/${profileId}/license/v1/ghost.pdf`
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { key, expiresAt: futureDate(365) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('LICENSE_NOT_UPLOADED')
  })

  it('400 content-type mismatch на HeadObject — cleanup', async () => {
    const { accessToken, profileId } = await createProfile({
      approvalStatus: 'approved',
      licenseVersion: 0,
    })
    const key = `crane-profiles/${profileId}/license/v1/bad.pdf`
    await writeFakeObject(key, Buffer.from('x'), 'application/octet-stream')
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { key, expiresAt: futureDate(365) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('LICENSE_CONTENT_TYPE_INVALID')
    // cleanup: object удалён
    const head = await handle.app.storage.headObject(key)
    expect(head).toBeNull()
  })

  it('400 size > 10MB — cleanup', async () => {
    const { accessToken, profileId } = await createProfile({
      approvalStatus: 'approved',
      licenseVersion: 0,
    })
    const key = `crane-profiles/${profileId}/license/v1/big.pdf`
    // 11MB buffer
    await writeFakeObject(key, Buffer.alloc(11 * 1024 * 1024), 'application/pdf')
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { key, expiresAt: futureDate(365) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('LICENSE_TOO_LARGE')
  })

  it('200 happy path: version=1, audit=license.upload_self, DTO содержит licenseUrl + licenseStatus=valid', async () => {
    const { accessToken, profileId } = await createProfile({
      approvalStatus: 'approved',
      licenseVersion: 0,
    })
    // Presign'им сами чтобы получить key с правильной версией.
    const presign = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/upload-url',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { contentType: 'application/pdf', filename: 'lic.pdf' },
    })
    const { key } = presign.json() as { key: string }
    await writeFakeObject(key, Buffer.from('ok'), 'application/pdf')

    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { key, expiresAt: futureDate(365) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      licenseVersion: number
      licenseUrl: string | null
      licenseStatus: string
      licenseExpiresAt: string | null
    }
    expect(body.licenseVersion).toBe(1)
    expect(body.licenseUrl).toEqual(expect.any(String))
    expect(body.licenseStatus).toBe('valid')
    expect(body.licenseExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, profileId), eq(auditLog.action, 'license.upload_self')))
    expect(audits).toHaveLength(1)
  })

  it('200 re-upload: version=2, warning-flags сброшены на новом документе', async () => {
    // Подсунем pre-existing state с warning-flags и v1, потом re-upload.
    const expired30dAgo = new Date(Date.now() - 30 * DAY)
    const { accessToken, profileId } = await createProfile({
      approvalStatus: 'approved',
      licenseVersion: 1,
      licenseKey: 'crane-profiles/fake/license/v1/old.pdf',
      licenseExpiresAt: new Date(Date.now() + 10 * DAY),
    })
    // Ставим warning-flags напрямую (имитируем cron проход).
    await handle.app.db.db
      .update(craneProfiles)
      .set({
        licenseWarning30dSentAt: expired30dAgo,
        licenseWarning7dSentAt: expired30dAgo,
      })
      .where(eq(craneProfiles.id, profileId))

    const presign = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/upload-url',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { contentType: 'application/pdf', filename: 'renew.pdf' },
    })
    const { key } = presign.json() as { key: string }
    await writeFakeObject(key, Buffer.from('renew'), 'application/pdf')

    const confirm = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/me/license/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { key, expiresAt: futureDate(365) },
    })
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json().licenseVersion).toBe(2)

    // Проверим что warning-flags сброшены в БД
    const rows = await handle.app.db.db
      .select({
        licenseWarning30dSentAt: craneProfiles.licenseWarning30dSentAt,
        licenseWarning7dSentAt: craneProfiles.licenseWarning7dSentAt,
        licenseExpiredAt: craneProfiles.licenseExpiredAt,
      })
      .from(craneProfiles)
      .where(eq(craneProfiles.id, profileId))
    expect(rows[0]?.licenseWarning30dSentAt).toBeNull()
    expect(rows[0]?.licenseWarning7dSentAt).toBeNull()
    expect(rows[0]?.licenseExpiredAt).toBeNull()
  })
})

describe('POST /:id/license/upload-url (admin)', () => {
  it('401 without token', async () => {
    const { profileId } = await createProfile({ approvalStatus: 'pending' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${profileId}/license/upload-url`,
      payload: { contentType: 'application/pdf', filename: 'x.pdf' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('403 for operator (self-path-only)', async () => {
    const a = await createProfile({ approvalStatus: 'approved' })
    const b = await createProfile({ approvalStatus: 'approved' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${b.profileId}/license/upload-url`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { contentType: 'application/pdf', filename: 'x.pdf' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403 for owner', async () => {
    const { profileId } = await createProfile({ approvalStatus: 'pending' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${profileId}/license/upload-url`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { contentType: 'application/pdf', filename: 'x.pdf' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('404 for unknown id', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/crane-profiles/00000000-0000-0000-0000-000000000000/license/upload-url',
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { contentType: 'application/pdf', filename: 'x.pdf' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('200 superadmin может загружать даже для pending profile (override)', async () => {
    const { profileId } = await createProfile({ approvalStatus: 'pending' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${profileId}/license/upload-url`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { contentType: 'application/pdf', filename: 'x.pdf' },
    })
    expect(res.statusCode).toBe(200)
    const json = res.json() as { key: string; version: number }
    expect(json.version).toBe(1)
    expect(json.key.startsWith(`crane-profiles/${profileId}/license/v1/`)).toBe(true)
  })
})

describe('POST /:id/license/confirm (admin)', () => {
  it('401 without token', async () => {
    const { profileId } = await createProfile({ approvalStatus: 'approved' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${profileId}/license/confirm`,
      payload: {
        key: `crane-profiles/${profileId}/license/v1/x.pdf`,
        expiresAt: futureDate(365),
      },
    })
    expect(res.statusCode).toBe(401)
  })

  it('403 for operator', async () => {
    const a = await createProfile({ approvalStatus: 'approved' })
    const b = await createProfile({ approvalStatus: 'approved' })
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${b.profileId}/license/confirm`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: {
        key: `crane-profiles/${b.profileId}/license/v1/x.pdf`,
        expiresAt: futureDate(365),
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('200 happy path — audit=license.upload_admin', async () => {
    const { profileId } = await createProfile({
      approvalStatus: 'pending',
      licenseVersion: 0,
    })
    const presign = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${profileId}/license/upload-url`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { contentType: 'application/pdf', filename: 'a.pdf' },
    })
    const { key } = presign.json() as { key: string }
    await writeFakeObject(key, Buffer.from('ok'), 'application/pdf')

    const confirm = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${profileId}/license/confirm`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { key, expiresAt: futureDate(365) },
    })
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json().licenseVersion).toBe(1)

    const audits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, profileId), eq(auditLog.action, 'license.upload_admin')))
    expect(audits).toHaveLength(1)
    // Self-audit action должен отсутствовать
    const selfAudits = await handle.app.db.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, profileId), eq(auditLog.action, 'license.upload_self')))
    expect(selfAudits).toHaveLength(0)
  })

  it('400 key prefix mismatch даже для admin (defense-in-depth)', async () => {
    const a = await createProfile({ approvalStatus: 'approved', licenseVersion: 0 })
    const b = await createProfile({ approvalStatus: 'approved', licenseVersion: 0 })
    const foreignKey = `crane-profiles/${b.profileId}/license/v1/x.pdf`
    const res = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/crane-profiles/${a.profileId}/license/confirm`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { key: foreignKey, expiresAt: futureDate(365) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('LICENSE_KEY_MISMATCH')
  })
})

describe('DTO surface: /me returns license fields', () => {
  it('GET /me: licenseUrl null, licenseStatus=missing для свежего approved profile', async () => {
    const { accessToken } = await createProfile({ approvalStatus: 'approved' })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/crane-profiles/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      licenseUrl: string | null
      licenseStatus: string
      licenseVersion: number
      licenseExpiresAt: string | null
    }
    expect(body.licenseUrl).toBeNull()
    expect(body.licenseStatus).toBe('missing')
    expect(body.licenseVersion).toBe(0)
    expect(body.licenseExpiresAt).toBeNull()
  })
})
