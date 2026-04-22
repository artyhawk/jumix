import { craneProfiles, organizationOperators } from '@jumix/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration-тесты organization-context plugin (ADR 0003 + authorization.md §4.2c).
 *
 * Plugin — preHandler `app.requireOrganizationContext`. Мы регистрируем
 * тестовый роут `/__test/org-ctx`, который повесит этот preHandler и вернёт
 * разрешённый context. Это позволяет гонять негативные и позитивные кейсы
 * через `inject()` без ожидания B2d-2b (реальные consumer-роуты ещё не
 * смонтированы).
 *
 * Матрица поведения (plugin JSDoc):
 *   - role != operator                     → 403 ORGANIZATION_CONTEXT_OPERATOR_ONLY
 *   - header missing/пустой                → 400 ORGANIZATION_HEADER_REQUIRED
 *   - header не UUID                       → 400 ORGANIZATION_HEADER_INVALID
 *   - нет активного approved найма         → 403 ORGANIZATION_MEMBERSHIP_NOT_FOUND
 *   - happy path                           → 200 + request.organizationContext
 *
 * Порядок проверок в плагине: role-check ПЕРЕД header-check (умышленно,
 * чтобы owner/superadmin не узнавали про существование header-семантики
 * через 400 вместо 403).
 */

const HEADER = 'x-organization-id'

let handle: TestAppHandle

let superadminToken: string
let ownerAToken: string
let orgAId: string
let orgBId: string
let fakeOrgId: string

beforeAll(async () => {
  handle = await buildTestApp()

  // Тестовый роут c обоими preHandler'ами в порядке authenticate →
  // requireOrganizationContext (такой же порядок, как в consumer-routes
  // B2d-2b+). Регистрация ДО первого inject(), иначе fastify зафризится
  // в ready-state.
  handle.app.get(
    '/__test/org-ctx',
    {
      preHandler: [handle.app.authenticate, handle.app.requireOrganizationContext],
    },
    async (request) => {
      const ctx = request.organizationContext
      if (!ctx) throw new Error('organizationContext was not attached')
      return {
        organizationOperatorId: ctx.organizationOperator.id,
        craneProfileId: ctx.craneProfile.id,
        organizationId: ctx.organizationOperator.organizationId,
      }
    },
  )

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77150000000',
    organizationId: null,
    name: 'Super',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const orgA = await createOrganization(handle.app, { name: 'Org A (ctx)', bin: '650000000001' })
  orgAId = orgA.id
  const ownerA = await createUser(handle.app, {
    role: 'owner',
    phone: '+77150000001',
    organizationId: orgAId,
    name: 'Owner A',
  })
  ownerAToken = await signTokenFor(handle.app, ownerA)

  const orgB = await createOrganization(handle.app, { name: 'Org B (ctx)', bin: '650000000002' })
  orgBId = orgB.id

  fakeOrgId = '00000000-0000-0000-0000-00000000fa1e'
}, 60_000)

afterAll(async () => {
  await handle.close()
})

let phoneSeq = 5000
function nextPhone(): string {
  phoneSeq += 1
  return `+7715${String(phoneSeq).padStart(7, '0')}`
}

function iin(seed: number): string {
  let base = Math.floor(seed)
  while (true) {
    const padded = String(base).padStart(11, '0')
    const digits = Array.from(padded, (c) => Number.parseInt(c, 10))
    const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]
    const weighted = (weights: number[]) =>
      weights.reduce((acc, w, i) => acc + (digits[i] ?? 0) * w, 0)
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

/**
 * Создаёт живого operator-пользователя + crane_profile (approved) + hire
 * в указанной организации. Статус hire задаётся параметрами. Возвращает
 * bearer token + ключевые id, нужные для assertions.
 *
 * Создаём НАПРЯМУЮ в БД (без POST /api/v1/operators), потому что нам нужен
 * контроль над approval_status / status / deleted_at hire-строки — admin-create
 * в B2d-2a всегда делает approved/active.
 */
async function createOperatorWithHire(opts: {
  organizationId: string
  hireApprovalStatus?: 'pending' | 'approved' | 'rejected'
  hireStatus?: 'active' | 'blocked' | 'terminated'
  hireDeletedAt?: Date | null
  profileDeletedAt?: Date | null
  profileApprovalStatus?: 'pending' | 'approved' | 'rejected'
}): Promise<{ token: string; userId: string; craneProfileId: string; hireId: string }> {
  const user = await createUser(handle.app, {
    role: 'operator',
    phone: nextPhone(),
    organizationId: opts.organizationId,
    name: 'Op',
  })

  const seed = Math.floor(Math.random() * 1_000_000_000)
  const profileRows = await handle.app.db.db
    .insert(craneProfiles)
    .values({
      userId: user.id,
      firstName: 'Ctx',
      lastName: 'Tester',
      iin: iin(seed),
      approvalStatus: opts.profileApprovalStatus ?? 'approved',
      deletedAt: opts.profileDeletedAt ?? null,
    })
    .returning({ id: craneProfiles.id })
  const craneProfileId = profileRows[0]?.id
  if (!craneProfileId) throw new Error('crane_profile insert failed')

  const hireRows = await handle.app.db.db
    .insert(organizationOperators)
    .values({
      craneProfileId,
      organizationId: opts.organizationId,
      approvalStatus: opts.hireApprovalStatus ?? 'approved',
      status: opts.hireStatus ?? 'active',
      deletedAt: opts.hireDeletedAt ?? null,
    })
    .returning({ id: organizationOperators.id })
  const hireId = hireRows[0]?.id
  if (!hireId) throw new Error('organization_operator insert failed')

  const token = await signTokenFor(handle.app, user)
  return { token, userId: user.id, craneProfileId, hireId }
}

describe('organization-context — role gate', () => {
  it('403 ORGANIZATION_CONTEXT_OPERATOR_ONLY: owner role', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: {
        authorization: `Bearer ${ownerAToken}`,
        [HEADER]: orgAId,
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ORGANIZATION_CONTEXT_OPERATOR_ONLY')
  })

  it('403 ORGANIZATION_CONTEXT_OPERATOR_ONLY: superadmin role', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: {
        authorization: `Bearer ${superadminToken}`,
        [HEADER]: orgAId,
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ORGANIZATION_CONTEXT_OPERATOR_ONLY')
  })

  it('403 owner получает role-gate ДО header-validation (порядок защиты)', async () => {
    // Owner без header'а всё равно должен уйти по role-gate, а не 400.
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${ownerAToken}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ORGANIZATION_CONTEXT_OPERATOR_ONLY')
  })
})

describe('organization-context — header validation (operator)', () => {
  it('400 ORGANIZATION_HEADER_REQUIRED: header missing', async () => {
    const hire = await createOperatorWithHire({ organizationId: orgAId })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}` },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('ORGANIZATION_HEADER_REQUIRED')
  })

  it('400 ORGANIZATION_HEADER_REQUIRED: header пустая строка', async () => {
    const hire = await createOperatorWithHire({ organizationId: orgAId })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}`, [HEADER]: '   ' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('ORGANIZATION_HEADER_REQUIRED')
  })

  it('400 ORGANIZATION_HEADER_INVALID: header не UUID', async () => {
    const hire = await createOperatorWithHire({ organizationId: orgAId })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}`, [HEADER]: 'not-a-uuid' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('ORGANIZATION_HEADER_INVALID')
  })

  it('400 ORGANIZATION_HEADER_INVALID: header это uuid-like, но мусор', async () => {
    const hire = await createOperatorWithHire({ organizationId: orgAId })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: {
        authorization: `Bearer ${hire.token}`,
        [HEADER]: 'gggggggg-gggg-gggg-gggg-gggggggggggg',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('ORGANIZATION_HEADER_INVALID')
  })
})

describe('organization-context — membership resolution', () => {
  it('200 happy path: active/approved hire → organizationContext прикреплён', async () => {
    const hire = await createOperatorWithHire({ organizationId: orgAId })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}`, [HEADER]: orgAId },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.organizationOperatorId).toBe(hire.hireId)
    expect(body.craneProfileId).toBe(hire.craneProfileId)
    expect(body.organizationId).toBe(orgAId)
  })

  it('403 ORGANIZATION_MEMBERSHIP_NOT_FOUND: найм в другой организации', async () => {
    const hire = await createOperatorWithHire({ organizationId: orgAId })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}`, [HEADER]: orgBId },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ORGANIZATION_MEMBERSHIP_NOT_FOUND')
  })

  it('403 ORGANIZATION_MEMBERSHIP_NOT_FOUND: org не существует', async () => {
    const hire = await createOperatorWithHire({ organizationId: orgAId })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}`, [HEADER]: fakeOrgId },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ORGANIZATION_MEMBERSHIP_NOT_FOUND')
  })

  it('403: hire.approval_status = pending', async () => {
    const hire = await createOperatorWithHire({
      organizationId: orgAId,
      hireApprovalStatus: 'pending',
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}`, [HEADER]: orgAId },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ORGANIZATION_MEMBERSHIP_NOT_FOUND')
  })

  it('403: hire.approval_status = rejected', async () => {
    const hire = await createOperatorWithHire({
      organizationId: orgAId,
      hireApprovalStatus: 'rejected',
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}`, [HEADER]: orgAId },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ORGANIZATION_MEMBERSHIP_NOT_FOUND')
  })

  it('403: hire.status = terminated (active employment invariant)', async () => {
    const hire = await createOperatorWithHire({
      organizationId: orgAId,
      hireStatus: 'terminated',
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}`, [HEADER]: orgAId },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ORGANIZATION_MEMBERSHIP_NOT_FOUND')
  })

  it('200: hire.status = blocked — per-org block НЕ режет доступ плагина (гейт — terminated/soft-delete/approval)', async () => {
    // Блокировка найма — сигнал для per-endpoint policy'ей, а не для identity
    // резолвера. Плагин прикрепляет context; дальше endpoint сам решает.
    const hire = await createOperatorWithHire({
      organizationId: orgAId,
      hireStatus: 'blocked',
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}`, [HEADER]: orgAId },
    })
    expect(res.statusCode).toBe(200)
  })

  it('403: hire.deleted_at IS NOT NULL (soft-deleted)', async () => {
    const hire = await createOperatorWithHire({
      organizationId: orgAId,
      hireDeletedAt: new Date(),
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}`, [HEADER]: orgAId },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ORGANIZATION_MEMBERSHIP_NOT_FOUND')
  })

  it('403: crane_profile.deleted_at IS NOT NULL', async () => {
    // Профиль soft-deleted — нет identity, hire ссылается в пустоту. Плагин
    // страхует JOIN'ом по crane_profiles.deleted_at IS NULL.
    const hire = await createOperatorWithHire({
      organizationId: orgAId,
      profileDeletedAt: new Date(),
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${hire.token}`, [HEADER]: orgAId },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ORGANIZATION_MEMBERSHIP_NOT_FOUND')
  })

  it('200: несколько hire — плагин резолвит именно ту, что в header', async () => {
    const user = await createUser(handle.app, {
      role: 'operator',
      phone: nextPhone(),
      organizationId: orgAId,
      name: 'Multi',
    })
    const seed = Math.floor(Math.random() * 1_000_000_000)
    const profile = await handle.app.db.db
      .insert(craneProfiles)
      .values({
        userId: user.id,
        firstName: 'Multi',
        lastName: 'Org',
        iin: iin(seed),
        approvalStatus: 'approved',
      })
      .returning({ id: craneProfiles.id })
    const craneProfileId = profile[0]?.id
    if (!craneProfileId) throw new Error('profile insert failed')

    const hireA = await handle.app.db.db
      .insert(organizationOperators)
      .values({
        craneProfileId,
        organizationId: orgAId,
        approvalStatus: 'approved',
        status: 'active',
      })
      .returning({ id: organizationOperators.id })
    const hireAId = hireA[0]?.id
    if (!hireAId) throw new Error('hire A insert failed')

    const hireB = await handle.app.db.db
      .insert(organizationOperators)
      .values({
        craneProfileId,
        organizationId: orgBId,
        approvalStatus: 'approved',
        status: 'active',
      })
      .returning({ id: organizationOperators.id })
    const hireBId = hireB[0]?.id
    if (!hireBId) throw new Error('hire B insert failed')

    const token = await signTokenFor(handle.app, user)

    const resA = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${token}`, [HEADER]: orgAId },
    })
    expect(resA.statusCode).toBe(200)
    expect(resA.json().organizationOperatorId).toBe(hireAId)

    const resB = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { authorization: `Bearer ${token}`, [HEADER]: orgBId },
    })
    expect(resB.statusCode).toBe(200)
    expect(resB.json().organizationOperatorId).toBe(hireBId)
  })
})

describe('organization-context — auth ordering', () => {
  it('401: нет bearer — authenticate отбивает ДО organization-context', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/__test/org-ctx',
      headers: { [HEADER]: orgAId },
    })
    expect(res.statusCode).toBe(401)
  })

  it('200: нелинейная проверка — confirmed through direct DB query', async () => {
    const hire = await createOperatorWithHire({ organizationId: orgAId })
    // Sanity: hire действительно живой, approved, active — чтобы happy path
    // не был false-positive (seed в другой org, наример).
    const rows = await handle.app.db.db
      .select()
      .from(organizationOperators)
      .where(eq(organizationOperators.id, hire.hireId))
    const row = rows[0]
    expect(row).toBeDefined()
    expect(row?.approvalStatus).toBe('approved')
    expect(row?.status).toBe('active')
    expect(row?.deletedAt).toBeNull()
    expect(row?.organizationId).toBe(orgAId)
  })
})
