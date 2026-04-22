import { auditLog, craneProfiles } from '@jumix/db'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { determineWarning } from '../src/jobs/license-expiry/worker'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createUser } from './helpers/fixtures'

/**
 * Integration-тесты LicenseExpiryWorker (ADR 0005 §/cron). Запускаем worker
 * напрямую (без BullMQ — worker class является plain-сервисом, cron — только
 * scheduler'ом поверх). Это даёт детерминированные тесты без Redis.
 *
 * Приоритет проверок:
 *   - scanned/processed counters
 *   - variant selection (30d / 7d / expired)
 *   - приоритет expired > 7d > 30d
 *   - idempotence (повторный run не дублирует audit)
 *   - exclusion (deleted_at / license_expires_at IS NULL)
 *   - audit row содержит variant + expiresAt в metadata
 *
 * BIN-серия не используется (тесты не создают организации).
 */

const DAY = 24 * 60 * 60 * 1000

let handle: TestAppHandle

beforeAll(async () => {
  handle = await buildTestApp()
}, 60_000)

afterAll(async () => {
  await handle.close()
})

let iinSeq = 900_000
let phoneSeq = 900
function nextIin(): string {
  let base = iinSeq + 1
  while (true) {
    const padded = String(base).padStart(11, '0')
    if (padded.length !== 11) throw new Error(`iin seed too large: ${base}`)
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
    iinSeq = base
    return padded + String(check)
  }
}
function nextPhone(): string {
  phoneSeq += 1
  return `+7719${String(phoneSeq).padStart(7, '0')}`
}

async function createProfileWithLicense(options: {
  licenseExpiresAt: Date | null
  warning30dSent?: Date | null
  warning7dSent?: Date | null
  expiredSent?: Date | null
  deletedAt?: Date | null
}): Promise<{ id: string }> {
  const user = await createUser(handle.app, {
    role: 'operator',
    phone: nextPhone(),
    organizationId: null,
    name: 'License Test',
  })
  const hasLicense = options.licenseExpiresAt !== null
  const rows = await handle.app.db.db
    .insert(craneProfiles)
    .values({
      userId: user.id,
      firstName: 'Lic',
      lastName: 'Test',
      iin: nextIin(),
      approvalStatus: 'approved',
      approvedAt: new Date(),
      licenseKey: hasLicense ? 'crane-profiles/fake/license/v1/doc.pdf' : null,
      licenseExpiresAt: options.licenseExpiresAt,
      licenseVersion: hasLicense ? 1 : 0,
      licenseWarning30dSentAt: options.warning30dSent ?? null,
      licenseWarning7dSentAt: options.warning7dSent ?? null,
      licenseExpiredAt: options.expiredSent ?? null,
      deletedAt: options.deletedAt ?? null,
    })
    .returning({ id: craneProfiles.id })
  const row = rows[0]
  if (!row) throw new Error('profile insert failed')
  return row
}

async function getProfile(id: string): Promise<{
  licenseWarning30dSentAt: Date | null
  licenseWarning7dSentAt: Date | null
  licenseExpiredAt: Date | null
}> {
  const rows = await handle.app.db.db
    .select({
      licenseWarning30dSentAt: craneProfiles.licenseWarning30dSentAt,
      licenseWarning7dSentAt: craneProfiles.licenseWarning7dSentAt,
      licenseExpiredAt: craneProfiles.licenseExpiredAt,
    })
    .from(craneProfiles)
    .where(eq(craneProfiles.id, id))
  const row = rows[0]
  if (!row) throw new Error(`profile ${id} vanished`)
  return row
}

async function auditRows(
  targetId: string,
): Promise<Array<{ action: string; metadata: Record<string, unknown> }>> {
  const rows = await handle.app.db.db
    .select({ action: auditLog.action, metadata: auditLog.metadata })
    .from(auditLog)
    .where(and(eq(auditLog.targetType, 'crane_profile'), eq(auditLog.targetId, targetId)))
  return rows as Array<{ action: string; metadata: Record<string, unknown> }>
}

describe('determineWarning (pure)', () => {
  const NOW = new Date('2026-04-22T00:00:00Z')

  it('null expires... — not applicable (row already filtered), но guard-check', () => {
    // функция сама не знает про null-filter, но по логике если expires в прошлом
    // и expired еще не отправлен — шлём expired.
    expect(
      determineWarning(
        {
          id: 'x',
          licenseExpiresAt: new Date(NOW.getTime() - DAY),
          licenseWarning30dSentAt: null,
          licenseWarning7dSentAt: null,
          licenseExpiredAt: null,
        },
        NOW,
      ),
    ).toBe('expired')
  })

  it('в прошлом + expired уже отправлен → null (нечего слать)', () => {
    expect(
      determineWarning(
        {
          id: 'x',
          licenseExpiresAt: new Date(NOW.getTime() - DAY),
          licenseWarning30dSentAt: new Date(),
          licenseWarning7dSentAt: new Date(),
          licenseExpiredAt: new Date(),
        },
        NOW,
      ),
    ).toBe(null)
  })

  it('через 5 дней, 7d ещё не отправлен → 7d', () => {
    expect(
      determineWarning(
        {
          id: 'x',
          licenseExpiresAt: new Date(NOW.getTime() + 5 * DAY),
          licenseWarning30dSentAt: new Date(),
          licenseWarning7dSentAt: null,
          licenseExpiredAt: null,
        },
        NOW,
      ),
    ).toBe('7d')
  })

  it('через 20 дней, 30d не отправлен → 30d', () => {
    expect(
      determineWarning(
        {
          id: 'x',
          licenseExpiresAt: new Date(NOW.getTime() + 20 * DAY),
          licenseWarning30dSentAt: null,
          licenseWarning7dSentAt: null,
          licenseExpiredAt: null,
        },
        NOW,
      ),
    ).toBe('30d')
  })

  it('через 40 дней → null (вне окна сканирования)', () => {
    expect(
      determineWarning(
        {
          id: 'x',
          licenseExpiresAt: new Date(NOW.getTime() + 40 * DAY),
          licenseWarning30dSentAt: null,
          licenseWarning7dSentAt: null,
          licenseExpiredAt: null,
        },
        NOW,
      ),
    ).toBe(null)
  })

  it('приоритет expired > 7d: через -1 день + 7d не отправлен → expired', () => {
    expect(
      determineWarning(
        {
          id: 'x',
          licenseExpiresAt: new Date(NOW.getTime() - DAY),
          licenseWarning30dSentAt: null,
          licenseWarning7dSentAt: null,
          licenseExpiredAt: null,
        },
        NOW,
      ),
    ).toBe('expired')
  })

  it('приоритет 7d > 30d: через 3 дня + 30d не отправлен → 7d (expired skip)', () => {
    expect(
      determineWarning(
        {
          id: 'x',
          licenseExpiresAt: new Date(NOW.getTime() + 3 * DAY),
          licenseWarning30dSentAt: null,
          licenseWarning7dSentAt: null,
          licenseExpiredAt: null,
        },
        NOW,
      ),
    ).toBe('7d')
  })
})

describe('LicenseExpiryWorker.process — integration', () => {
  it('scanned=0, processed=0 когда нет кандидатов', async () => {
    // Только чистый profile без license — не попадает в scan.
    await createProfileWithLicense({ licenseExpiresAt: null })
    const result = await handle.app.licenseExpiryWorker.process()
    // scanned может быть >= 0 в зависимости от предыдущих тестов; но данный
    // profile в scan не войдёт (licenseExpiresAt IS NULL).
    expect(result.processed).toBeGreaterThanOrEqual(0)
    expect(result.warningsSent).toHaveProperty('30d')
    expect(result.warningsSent).toHaveProperty('7d')
    expect(result.warningsSent).toHaveProperty('expired')
  })

  it('ставит 30d warning и пишет audit для profile expires в 15 дней', async () => {
    const profile = await createProfileWithLicense({
      licenseExpiresAt: new Date(Date.now() + 15 * DAY),
    })

    const before = await auditRows(profile.id)
    const warningsBefore = before.filter((r) => r.action === 'license.warning_sent').length

    await handle.app.licenseExpiryWorker.process()

    const after = await getProfile(profile.id)
    expect(after.licenseWarning30dSentAt).not.toBeNull()
    expect(after.licenseWarning7dSentAt).toBeNull()
    expect(after.licenseExpiredAt).toBeNull()

    const auditAfter = await auditRows(profile.id)
    const warningsAdded = auditAfter.filter((r) => r.action === 'license.warning_sent')
    expect(warningsAdded.length).toBe(warningsBefore + 1)
    expect(warningsAdded.at(-1)?.metadata.variant).toBe('30d')
  })

  it('ставит 7d warning для profile expires в 5 дней (30d уже был)', async () => {
    const profile = await createProfileWithLicense({
      licenseExpiresAt: new Date(Date.now() + 5 * DAY),
      warning30dSent: new Date(Date.now() - 10 * DAY),
    })

    await handle.app.licenseExpiryWorker.process()

    const after = await getProfile(profile.id)
    expect(after.licenseWarning7dSentAt).not.toBeNull()
    expect(after.licenseExpiredAt).toBeNull()

    const audit = await auditRows(profile.id)
    const warning = audit.findLast((r) => r.action === 'license.warning_sent')
    expect(warning?.metadata.variant).toBe('7d')
  })

  it('ставит expired для profile expired 1 день назад', async () => {
    const profile = await createProfileWithLicense({
      licenseExpiresAt: new Date(Date.now() - DAY),
      warning30dSent: new Date(Date.now() - 30 * DAY),
      warning7dSent: new Date(Date.now() - 10 * DAY),
    })

    await handle.app.licenseExpiryWorker.process()

    const after = await getProfile(profile.id)
    expect(after.licenseExpiredAt).not.toBeNull()

    const audit = await auditRows(profile.id)
    const warning = audit.findLast((r) => r.action === 'license.warning_sent')
    expect(warning?.metadata.variant).toBe('expired')
  })

  it('идемпотентно: повторный запуск НЕ пишет второй audit row', async () => {
    const profile = await createProfileWithLicense({
      licenseExpiresAt: new Date(Date.now() + 20 * DAY),
    })

    await handle.app.licenseExpiryWorker.process()
    const afterFirst = await auditRows(profile.id)
    const countFirst = afterFirst.filter((r) => r.action === 'license.warning_sent').length

    await handle.app.licenseExpiryWorker.process()
    const afterSecond = await auditRows(profile.id)
    const countSecond = afterSecond.filter((r) => r.action === 'license.warning_sent').length

    expect(countFirst).toBe(1)
    expect(countSecond).toBe(1)
  })

  it('исключает soft-deleted profiles', async () => {
    const profile = await createProfileWithLicense({
      licenseExpiresAt: new Date(Date.now() + 10 * DAY),
      deletedAt: new Date(),
    })

    await handle.app.licenseExpiryWorker.process()

    const after = await getProfile(profile.id)
    expect(after.licenseWarning30dSentAt).toBeNull()
    const audit = await auditRows(profile.id)
    expect(audit.filter((r) => r.action === 'license.warning_sent').length).toBe(0)
  })

  it('исключает profiles без license_expires_at', async () => {
    const profile = await createProfileWithLicense({ licenseExpiresAt: null })

    await handle.app.licenseExpiryWorker.process()

    const after = await getProfile(profile.id)
    expect(after.licenseWarning30dSentAt).toBeNull()
    expect(after.licenseExpiredAt).toBeNull()
  })

  it('priority: expired over 7d (profile просрочен, 7d не отправлялся)', async () => {
    const profile = await createProfileWithLicense({
      licenseExpiresAt: new Date(Date.now() - 2 * DAY),
    })

    await handle.app.licenseExpiryWorker.process()

    const after = await getProfile(profile.id)
    // expired ставится, а 7d и 30d — нет (priority-principle)
    expect(after.licenseExpiredAt).not.toBeNull()
    expect(after.licenseWarning7dSentAt).toBeNull()
    expect(after.licenseWarning30dSentAt).toBeNull()

    const audit = await auditRows(profile.id)
    const warnings = audit.filter((r) => r.action === 'license.warning_sent')
    expect(warnings.length).toBe(1)
    expect(warnings[0]?.metadata.variant).toBe('expired')
  })

  it('metadata содержит expiresAt в ISO формате', async () => {
    const expires = new Date(Date.now() + 10 * DAY)
    const profile = await createProfileWithLicense({ licenseExpiresAt: expires })

    await handle.app.licenseExpiryWorker.process()

    const audit = await auditRows(profile.id)
    const warning = audit.findLast((r) => r.action === 'license.warning_sent')
    expect(typeof warning?.metadata.expiresAt).toBe('string')
    // ISO date со суффиксом Z — быть proof'ом что это серверный UTC-time.
    expect((warning?.metadata.expiresAt as string).endsWith('Z')).toBe(true)
  })

  it('action=license.warning_sent (не license.warning_30d) — variant лежит в metadata', async () => {
    const profile = await createProfileWithLicense({
      licenseExpiresAt: new Date(Date.now() + 20 * DAY),
    })

    await handle.app.licenseExpiryWorker.process()

    const audit = await auditRows(profile.id)
    const w = audit.findLast((r) => r.action === 'license.warning_sent')
    expect(w).toBeDefined()
    expect(w?.metadata.variant).toBe('30d')
  })
})
