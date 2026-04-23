import { craneProfiles, organizationOperators } from '@jumix/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты GET /api/v1/crane-profiles/me/status (ADR 0004 §/me/status).
 *
 * Отдельный suite от crane-profile.test.ts чтобы удобно варьировать комбинации
 * (approvalStatus × hire.approvalStatus × hire.status × число memberships)
 * без засорения основного suite'а. Фокус:
 *   - access control: 401 / 403 для не-operator'ов
 *   - derived canWork = profile.approved && some(hire: approved+active)
 *   - rejectionReason передаётся в dto для rejected профилей
 *   - soft-deleted hires исключены из memberships
 *   - multiple memberships: сортировка не гарантируется, но все видны
 *
 * Профиль создаём напрямую в БД (минуя registration flow — он покрыт
 * в registration.test.ts), hire — тоже insert'ом. Это самый быстрый путь
 * построить нужные состояния.
 *
 * BIN-серия 66xxxx (не пересекается с 61/62/63/64/65/68).
 */

let handle: TestAppHandle

let superadminToken: string
let ownerToken: string
let orgId: string
let orgName: string

beforeAll(async () => {
  handle = await buildTestApp()

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77160000000',
    organizationId: null,
    name: 'Super',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  orgName = 'MeStatus Org'
  const org = await createOrganization(handle.app, { name: orgName, bin: '660000000001' })
  orgId = org.id
  const owner = await createUser(handle.app, {
    role: 'owner',
    phone: '+77160000001',
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

let phoneSeq = 200
function nextPhone(): string {
  phoneSeq += 1
  return `+7716${String(phoneSeq).padStart(7, '0')}`
}

let iinSeq = 60_000
function nextIin(): string {
  iinSeq += 1
  return iin(iinSeq)
}

function futureDate(daysFromNow: number): Date {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
}

function pastDate(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
}

type Approval = 'pending' | 'approved' | 'rejected'
type HireStatus = 'active' | 'blocked' | 'terminated'

async function createOperator(options: {
  approvalStatus?: Approval
  rejectionReason?: string | null
  firstName?: string
  lastName?: string
  /** ADR 0005: включая license-поля поддерживаем полный 3-gate canWork-scan. */
  licenseKey?: string | null
  licenseExpiresAt?: Date | null
}): Promise<{ userId: string; profileId: string; accessToken: string }> {
  const user = await createUser(handle.app, {
    role: 'operator',
    phone: nextPhone(),
    organizationId: null,
    name: `${options.firstName ?? 'Op'} ${options.lastName ?? 'Erator'}`,
  })
  const approvalStatus = options.approvalStatus ?? 'pending'
  const values: {
    userId: string
    firstName: string
    lastName: string
    iin: string
    specialization: Record<string, unknown>
    approvalStatus: Approval
    approvedAt?: Date | null
    rejectedAt?: Date | null
    rejectionReason?: string | null
    licenseKey?: string | null
    licenseExpiresAt?: Date | null
    licenseVersion?: number
  } = {
    userId: user.id,
    firstName: options.firstName ?? 'Op',
    lastName: options.lastName ?? 'Erator',
    iin: nextIin(),
    specialization: {},
    approvalStatus,
  }
  if (approvalStatus === 'approved') values.approvedAt = new Date()
  if (approvalStatus === 'rejected') {
    values.rejectedAt = new Date()
    values.rejectionReason = options.rejectionReason ?? 'Документы неполные'
  }
  if (options.licenseExpiresAt !== undefined) {
    values.licenseKey = options.licenseKey ?? 'crane-profiles/fake/license/v1/test.pdf'
    values.licenseExpiresAt = options.licenseExpiresAt
    values.licenseVersion = 1
  }
  const inserted = await handle.app.db.db.insert(craneProfiles).values(values).returning()
  const profile = inserted[0]
  if (!profile) throw new Error('crane_profile insert failed')
  const accessToken = await signTokenFor(handle.app, user)
  return { userId: user.id, profileId: profile.id, accessToken }
}

async function createHire(
  profileId: string,
  options: {
    organizationId?: string
    approvalStatus?: Approval
    status?: HireStatus
    deletedAt?: Date | null
  } = {},
): Promise<{ id: string }> {
  const approvalStatus = options.approvalStatus ?? 'approved'
  const status = options.status ?? 'active'
  const rows = await handle.app.db.db
    .insert(organizationOperators)
    .values({
      craneProfileId: profileId,
      organizationId: options.organizationId ?? orgId,
      approvalStatus,
      status,
      approvedAt: approvalStatus === 'approved' ? new Date() : null,
      rejectedAt: approvalStatus === 'rejected' ? new Date() : null,
      rejectionReason: approvalStatus === 'rejected' ? 'org отклонил' : null,
      deletedAt: options.deletedAt ?? null,
    })
    .returning({ id: organizationOperators.id })
  const row = rows[0]
  if (!row) throw new Error('hire insert failed')
  return row
}

type LicenseStatusKind = 'missing' | 'valid' | 'expiring_soon' | 'expiring_critical' | 'expired'

async function meStatus(token: string | null): Promise<{
  statusCode: number
  body: {
    profile?: {
      id: string
      approvalStatus: Approval
      rejectionReason: string | null
      firstName?: string
      lastName?: string
      iin?: string
      phone?: string
      licenseStatus?: LicenseStatusKind
      licenseExpiresAt?: string | null
    }
    memberships?: Array<{
      id: string
      organizationId: string
      organizationName: string
      approvalStatus: Approval
      status: HireStatus
      hiredAt?: string | null
      approvedAt?: string | null
      rejectedAt?: string | null
      terminatedAt?: string | null
      rejectionReason?: string | null
    }>
    licenseStatus?: LicenseStatusKind
    canWork?: boolean
    canWorkReasons?: string[]
    error?: { code: string }
  }
}> {
  const res = await handle.app.inject({
    method: 'GET',
    url: '/api/v1/crane-profiles/me/status',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
  return { statusCode: res.statusCode, body: res.json() as never }
}

describe('GET /api/v1/crane-profiles/me/status — access control', () => {
  it('401 TOKEN_MISSING without Authorization header', async () => {
    const { statusCode, body } = await meStatus(null)
    expect(statusCode).toBe(401)
    expect(body.error?.code).toBe('TOKEN_MISSING')
  })

  it('401 with invalid token', async () => {
    const { statusCode } = await meStatus('garbage')
    expect(statusCode).toBe(401)
  })

  it('403 FORBIDDEN for superadmin (operator-only endpoint)', async () => {
    const { statusCode, body } = await meStatus(superadminToken)
    expect(statusCode).toBe(403)
    expect(body.error?.code).toBe('FORBIDDEN')
  })

  it('403 FORBIDDEN for owner (operator-only endpoint)', async () => {
    const { statusCode, body } = await meStatus(ownerToken)
    expect(statusCode).toBe(403)
    expect(body.error?.code).toBe('FORBIDDEN')
  })

  it('404 CRANE_PROFILE_NOT_FOUND if operator user has no crane_profile row', async () => {
    // Operator без crane_profile — теоретический кейс (в registration flow
    // они создаются атомарно, но здесь имитируем "полусиротский" state).
    const orphan = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: null,
    })
    const token = await signTokenFor(handle.app, orphan)
    const { statusCode, body } = await meStatus(token)
    expect(statusCode).toBe(404)
    expect(body.error?.code).toBe('CRANE_PROFILE_NOT_FOUND')
  })
})

describe('GET /api/v1/crane-profiles/me/status — profile approval state', () => {
  it('pending profile → approvalStatus=pending, rejectionReason=null, canWork=false', async () => {
    const { accessToken, profileId } = await createOperator({ approvalStatus: 'pending' })
    const { statusCode, body } = await meStatus(accessToken)
    expect(statusCode).toBe(200)
    expect(body.profile?.id).toBe(profileId)
    expect(body.profile?.approvalStatus).toBe('pending')
    expect(body.profile?.rejectionReason).toBeNull()
    expect(body.memberships).toEqual([])
    expect(body.canWork).toBe(false)
  })

  it('approved profile without memberships → canWork=false', async () => {
    const { accessToken } = await createOperator({ approvalStatus: 'approved' })
    const { body } = await meStatus(accessToken)
    expect(body.profile?.approvalStatus).toBe('approved')
    expect(body.memberships).toEqual([])
    expect(body.canWork).toBe(false)
  })

  it('rejected profile → rejectionReason surfaced, canWork=false', async () => {
    const { accessToken } = await createOperator({
      approvalStatus: 'rejected',
      rejectionReason: 'ИИН не найден в базе',
    })
    const { body } = await meStatus(accessToken)
    expect(body.profile?.approvalStatus).toBe('rejected')
    expect(body.profile?.rejectionReason).toBe('ИИН не найден в базе')
    expect(body.canWork).toBe(false)
  })

  it('rejected profile + approved active hire → canWork=false (profile gate wins)', async () => {
    const { accessToken, profileId } = await createOperator({ approvalStatus: 'rejected' })
    await createHire(profileId, { approvalStatus: 'approved', status: 'active' })
    const { body } = await meStatus(accessToken)
    expect(body.canWork).toBe(false)
    expect(body.memberships).toHaveLength(1)
  })
})

describe('GET /api/v1/crane-profiles/me/status — hire state combinations', () => {
  it('approved profile + pending hire → canWork=false', async () => {
    const { accessToken, profileId } = await createOperator({ approvalStatus: 'approved' })
    await createHire(profileId, { approvalStatus: 'pending', status: 'active' })
    const { body } = await meStatus(accessToken)
    expect(body.memberships).toHaveLength(1)
    expect(body.memberships?.[0]?.approvalStatus).toBe('pending')
    expect(body.canWork).toBe(false)
  })

  it('approved profile + rejected hire → canWork=false', async () => {
    const { accessToken, profileId } = await createOperator({ approvalStatus: 'approved' })
    await createHire(profileId, { approvalStatus: 'rejected', status: 'active' })
    const { body } = await meStatus(accessToken)
    expect(body.memberships?.[0]?.approvalStatus).toBe('rejected')
    expect(body.canWork).toBe(false)
  })

  it('approved profile + approved+blocked hire → canWork=false', async () => {
    const { accessToken, profileId } = await createOperator({ approvalStatus: 'approved' })
    await createHire(profileId, { approvalStatus: 'approved', status: 'blocked' })
    const { body } = await meStatus(accessToken)
    expect(body.memberships?.[0]?.status).toBe('blocked')
    expect(body.canWork).toBe(false)
  })

  it('approved profile + approved+terminated hire → canWork=false', async () => {
    const { accessToken, profileId } = await createOperator({ approvalStatus: 'approved' })
    await createHire(profileId, { approvalStatus: 'approved', status: 'terminated' })
    const { body } = await meStatus(accessToken)
    expect(body.memberships?.[0]?.status).toBe('terminated')
    expect(body.canWork).toBe(false)
  })

  it('approved profile + approved+active hire + valid license → canWork=true, org name surfaced', async () => {
    const { accessToken, profileId } = await createOperator({
      approvalStatus: 'approved',
      licenseExpiresAt: futureDate(365),
    })
    await createHire(profileId, { approvalStatus: 'approved', status: 'active' })
    const { body } = await meStatus(accessToken)
    expect(body.memberships).toHaveLength(1)
    expect(body.memberships?.[0]?.organizationId).toBe(orgId)
    expect(body.memberships?.[0]?.organizationName).toBe(orgName)
    expect(body.memberships?.[0]?.approvalStatus).toBe('approved')
    expect(body.memberships?.[0]?.status).toBe('active')
    expect(body.licenseStatus).toBe('valid')
    expect(body.canWork).toBe(true)
  })
})

describe('GET /api/v1/crane-profiles/me/status — multiple memberships', () => {
  it('two orgs: one approved+active + one pending → canWork=true, both surfaced', async () => {
    const org2 = await createOrganization(handle.app, {
      name: 'Secondary Org',
      bin: '660000000002',
    })
    const { accessToken, profileId } = await createOperator({
      approvalStatus: 'approved',
      licenseExpiresAt: futureDate(200),
    })
    await createHire(profileId, { approvalStatus: 'approved', status: 'active' })
    await createHire(profileId, {
      organizationId: org2.id,
      approvalStatus: 'pending',
      status: 'active',
    })
    const { body } = await meStatus(accessToken)
    expect(body.memberships).toHaveLength(2)
    const approvalStatuses = body.memberships?.map((m) => m.approvalStatus).sort()
    expect(approvalStatuses).toEqual(['approved', 'pending'])
    expect(body.canWork).toBe(true)
  })

  it('two orgs: one rejected + one approved+active → canWork=true (any approved+active)', async () => {
    const org2 = await createOrganization(handle.app, {
      name: 'Third Org',
      bin: '660000000003',
    })
    const { accessToken, profileId } = await createOperator({
      approvalStatus: 'approved',
      licenseExpiresAt: futureDate(200),
    })
    await createHire(profileId, { approvalStatus: 'rejected', status: 'active' })
    await createHire(profileId, {
      organizationId: org2.id,
      approvalStatus: 'approved',
      status: 'active',
    })
    const { body } = await meStatus(accessToken)
    expect(body.memberships).toHaveLength(2)
    expect(body.canWork).toBe(true)
  })

  it('soft-deleted hire is excluded from memberships', async () => {
    const { accessToken, profileId } = await createOperator({ approvalStatus: 'approved' })
    await createHire(profileId, {
      approvalStatus: 'approved',
      status: 'active',
      deletedAt: new Date(),
    })
    const { body } = await meStatus(accessToken)
    expect(body.memberships).toEqual([])
    expect(body.canWork).toBe(false)
  })
})

describe('GET /api/v1/crane-profiles/me/status — DTO shape', () => {
  it('profile DTO содержит полный identity + phone (B3-UI-4 extension)', async () => {
    const { accessToken } = await createOperator({ approvalStatus: 'pending' })
    const { body } = await meStatus(accessToken)
    // phone (masked) + identity поля теперь exposed для web operator cabinet.
    // Шейп совпадает с `GET /me` (toPublicDTO).
    expect(body.profile?.firstName).toEqual(expect.any(String))
    expect(body.profile?.lastName).toEqual(expect.any(String))
    expect(body.profile?.iin).toEqual(expect.any(String))
    expect(body.profile?.phone).toMatch(/^\+7/)
    expect(body.profile?.approvalStatus).toBe('pending')
  })

  it('top-level keys — profile/memberships/licenseStatus/canWork/canWorkReasons', async () => {
    const { accessToken } = await createOperator({ approvalStatus: 'pending' })
    const { body } = await meStatus(accessToken)
    expect(Object.keys(body).sort()).toEqual([
      'canWork',
      'canWorkReasons',
      'licenseStatus',
      'memberships',
      'profile',
    ])
  })

  it('membership DTO содержит даты + rejection reason (B3-UI-4 extension)', async () => {
    const { accessToken, profileId } = await createOperator({
      approvalStatus: 'approved',
      licenseExpiresAt: futureDate(365),
    })
    await createHire(profileId, { approvalStatus: 'approved', status: 'active' })
    const { body } = await meStatus(accessToken)
    expect(body.memberships).toHaveLength(1)
    const keys = Object.keys(body.memberships?.[0] ?? {}).sort()
    expect(keys).toEqual([
      'approvalStatus',
      'approvedAt',
      'hiredAt',
      'id',
      'organizationId',
      'organizationName',
      'rejectedAt',
      'rejectionReason',
      'status',
      'terminatedAt',
    ])
  })
})

/**
 * B3-UI-4: canWorkReasons — human-readable причины блокировки для web UI.
 * Computed на service boundary; empty array когда canWork=true.
 */
describe('GET /api/v1/crane-profiles/me/status — canWorkReasons (B3-UI-4)', () => {
  it('canWork=true → canWorkReasons пуст', async () => {
    const { accessToken, profileId } = await createOperator({
      approvalStatus: 'approved',
      licenseExpiresAt: futureDate(365),
    })
    await createHire(profileId, { approvalStatus: 'approved', status: 'active' })
    const { body } = await meStatus(accessToken)
    expect(body.canWork).toBe(true)
    expect(body.canWorkReasons).toEqual([])
  })

  it('pending profile → «Профиль ожидает одобрения платформой»', async () => {
    const { accessToken } = await createOperator({ approvalStatus: 'pending' })
    const { body } = await meStatus(accessToken)
    expect(body.canWorkReasons).toContain('Профиль ожидает одобрения платформой')
  })

  it('rejected profile → «Профиль отклонён платформой»', async () => {
    const { accessToken } = await createOperator({ approvalStatus: 'rejected' })
    const { body } = await meStatus(accessToken)
    expect(body.canWorkReasons).toContain('Профиль отклонён платформой')
  })

  it('approved profile без hires → «Нет активных трудоустройств»', async () => {
    const { accessToken } = await createOperator({ approvalStatus: 'approved' })
    const { body } = await meStatus(accessToken)
    expect(body.canWorkReasons).toContain('Нет активных трудоустройств')
  })

  it('missing license → «Удостоверение не загружено»', async () => {
    const { accessToken, profileId } = await createOperator({ approvalStatus: 'approved' })
    await createHire(profileId, { approvalStatus: 'approved', status: 'active' })
    const { body } = await meStatus(accessToken)
    expect(body.canWorkReasons).toContain('Удостоверение не загружено')
  })

  it('expired license → «Срок действия удостоверения истёк»', async () => {
    const { accessToken, profileId } = await createOperator({
      approvalStatus: 'approved',
      licenseExpiresAt: pastDate(1),
    })
    await createHire(profileId, { approvalStatus: 'approved', status: 'active' })
    const { body } = await meStatus(accessToken)
    expect(body.canWorkReasons).toContain('Срок действия удостоверения истёк')
  })

  it('multiple blockers: pending profile + no hires + no license → все 3 reasons', async () => {
    const { accessToken } = await createOperator({ approvalStatus: 'pending' })
    const { body } = await meStatus(accessToken)
    expect(body.canWorkReasons).toEqual(
      expect.arrayContaining([
        'Профиль ожидает одобрения платформой',
        'Нет активных трудоустройств',
        'Удостоверение не загружено',
      ]),
    )
    expect(body.canWorkReasons?.length).toBe(3)
  })
})

/**
 * ADR 0005 — license-gate как третья компонента canWork.
 * profile.approved && some(approved+active hire) уже закрыты выше;
 * этот блок фиксирует поведение самого license-gate.
 */
describe('GET /api/v1/crane-profiles/me/status — license-gate (ADR 0005)', () => {
  async function setup(licenseExpiresAt: Date | null): Promise<{
    accessToken: string
  }> {
    const { accessToken, profileId } = await createOperator({
      approvalStatus: 'approved',
      licenseExpiresAt: licenseExpiresAt ?? undefined,
    })
    await createHire(profileId, { approvalStatus: 'approved', status: 'active' })
    return { accessToken }
  }

  it('license missing → licenseStatus=missing, canWork=false даже с approved+active hire', async () => {
    const { accessToken } = await setup(null)
    const { body } = await meStatus(accessToken)
    expect(body.licenseStatus).toBe('missing')
    expect(body.canWork).toBe(false)
  })

  it('license valid (>30d) → licenseStatus=valid, canWork=true', async () => {
    const { accessToken } = await setup(futureDate(90))
    const { body } = await meStatus(accessToken)
    expect(body.licenseStatus).toBe('valid')
    expect(body.canWork).toBe(true)
  })

  it('license expiring_soon (>7d, ≤30d) → canWork=true (warning, not block)', async () => {
    const { accessToken } = await setup(futureDate(15))
    const { body } = await meStatus(accessToken)
    expect(body.licenseStatus).toBe('expiring_soon')
    expect(body.canWork).toBe(true)
  })

  it('license expiring_critical (≤7d) → canWork=true (warning, not block)', async () => {
    const { accessToken } = await setup(futureDate(3))
    const { body } = await meStatus(accessToken)
    expect(body.licenseStatus).toBe('expiring_critical')
    expect(body.canWork).toBe(true)
  })

  it('license expired → canWork=false', async () => {
    const { accessToken } = await setup(pastDate(1))
    const { body } = await meStatus(accessToken)
    expect(body.licenseStatus).toBe('expired')
    expect(body.canWork).toBe(false)
  })

  it('pending profile + valid license → canWork=false (profile-gate wins)', async () => {
    const { accessToken } = await createOperator({
      approvalStatus: 'pending',
      licenseExpiresAt: futureDate(365),
    })
    const { body } = await meStatus(accessToken)
    expect(body.licenseStatus).toBe('valid')
    expect(body.canWork).toBe(false)
  })
})
