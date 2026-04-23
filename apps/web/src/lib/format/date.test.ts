import { describe, expect, it } from 'vitest'
import { daysUntil, formatRuDate, formatRuLongDate } from './date'

describe('formatRuLongDate', () => {
  it('capitalises the weekday (Intl gives lowercase)', () => {
    const result = formatRuLongDate(new Date('2026-04-22T10:00:00Z'))
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase())
    expect(result.startsWith('Среда')).toBe(true)
  })

  it('formats as "Weekday, D month YYYY г."', () => {
    const result = formatRuLongDate(new Date('2026-04-22T10:00:00Z'))
    expect(result).toBe('Среда, 22 апреля 2026 г.')
  })

  it('respects the passed Date argument (not just "now")', () => {
    const nye = formatRuLongDate(new Date('2026-12-31T12:00:00Z'))
    expect(nye).toContain('31 декабря 2026')
    expect(nye.charAt(0)).toBe(nye.charAt(0).toUpperCase())
  })
})

describe('formatRuDate', () => {
  it('formats ISO date string (YYYY-MM-DD) — "12 апреля 2027"', () => {
    expect(formatRuDate('2027-04-12')).toBe('12 апреля 2027 г.')
  })

  it('formats ISO timestamp', () => {
    expect(formatRuDate('2027-04-12T15:00:00Z')).toContain('апреля 2027')
  })

  it('returns empty string for invalid input', () => {
    expect(formatRuDate('not-a-date')).toBe('')
  })
})

describe('daysUntil', () => {
  it('positive when expiresAt in the future', () => {
    const now = new Date('2026-04-20T10:00:00Z')
    const future = '2026-04-25'
    expect(daysUntil(future, now)).toBe(5)
  })

  it('zero when same calendar day', () => {
    const now = new Date('2026-04-20T10:00:00Z')
    expect(daysUntil('2026-04-20', now)).toBe(0)
  })

  it('negative when expiresAt in the past', () => {
    const now = new Date('2026-04-20T10:00:00Z')
    expect(daysUntil('2026-04-15', now)).toBe(-5)
  })

  it('returns 0 for invalid input', () => {
    expect(daysUntil('garbage', new Date('2026-04-20T10:00:00Z'))).toBe(0)
  })
})
