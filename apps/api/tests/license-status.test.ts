import { describe, expect, it } from 'vitest'
import {
  type LicenseStatus,
  computeLicenseStatus,
  isLicenseValidForWork,
} from '../src/modules/crane-profile/license-status'

/**
 * Unit-тесты для pure-функции computeLicenseStatus + isLicenseValidForWork
 * (ADR 0005). Без DB — запускаются мгновенно, покрывают границы 0 / 7d / 30d.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-04-22T12:00:00Z')

describe('computeLicenseStatus', () => {
  it('null expiresAt → missing', () => {
    expect(computeLicenseStatus(null, NOW)).toBe('missing')
  })

  it('expiresAt в прошлом → expired', () => {
    const past = new Date(NOW.getTime() - DAY)
    expect(computeLicenseStatus(past, NOW)).toBe('expired')
  })

  it('expiresAt точно NOW → expired (<=0 msRemaining)', () => {
    expect(computeLicenseStatus(NOW, NOW)).toBe('expired')
  })

  it('expiresAt через 1 день → expiring_critical', () => {
    const inOneDay = new Date(NOW.getTime() + DAY)
    expect(computeLicenseStatus(inOneDay, NOW)).toBe('expiring_critical')
  })

  it('expiresAt через ровно 7 дней → expiring_critical (включительно)', () => {
    const in7d = new Date(NOW.getTime() + 7 * DAY)
    expect(computeLicenseStatus(in7d, NOW)).toBe('expiring_critical')
  })

  it('expiresAt через 10 дней → expiring_soon', () => {
    const in10d = new Date(NOW.getTime() + 10 * DAY)
    expect(computeLicenseStatus(in10d, NOW)).toBe('expiring_soon')
  })

  it('expiresAt через ровно 30 дней → expiring_soon (включительно)', () => {
    const in30d = new Date(NOW.getTime() + 30 * DAY)
    expect(computeLicenseStatus(in30d, NOW)).toBe('expiring_soon')
  })

  it('expiresAt через 31 день → valid', () => {
    const in31d = new Date(NOW.getTime() + 31 * DAY)
    expect(computeLicenseStatus(in31d, NOW)).toBe('valid')
  })

  it('expiresAt далеко в будущем (>1 год) → valid', () => {
    const inYear = new Date(NOW.getTime() + 365 * DAY)
    expect(computeLicenseStatus(inYear, NOW)).toBe('valid')
  })
})

describe('isLicenseValidForWork', () => {
  it.each<[LicenseStatus, boolean]>([
    ['missing', false],
    ['valid', true],
    ['expiring_soon', true],
    ['expiring_critical', true],
    ['expired', false],
  ])('%s → %s', (status, expected) => {
    expect(isLicenseValidForWork(status)).toBe(expected)
  })
})
