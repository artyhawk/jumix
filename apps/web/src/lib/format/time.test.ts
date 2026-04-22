import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './time'

describe('formatRelativeTime', () => {
  const now = new Date('2026-04-22T12:00:00Z')

  function iso(offsetMs: number) {
    return new Date(now.getTime() - offsetMs).toISOString()
  }

  it('returns "только что" for < 1 minute', () => {
    expect(formatRelativeTime(iso(30_000), now)).toBe('только что')
  })

  it('returns "только что" for future timestamps (clock skew)', () => {
    expect(formatRelativeTime(iso(-60_000), now)).toBe('только что')
  })

  it('returns minutes for < 60 minutes', () => {
    expect(formatRelativeTime(iso(5 * 60_000), now)).toBe('5 мин назад')
    expect(formatRelativeTime(iso(59 * 60_000), now)).toBe('59 мин назад')
  })

  it('returns hours for < 24 hours', () => {
    expect(formatRelativeTime(iso(60 * 60_000), now)).toBe('1 ч назад')
    expect(formatRelativeTime(iso(23 * 60 * 60_000), now)).toBe('23 ч назад')
  })

  it('returns days for < 7 days', () => {
    expect(formatRelativeTime(iso(24 * 60 * 60_000), now)).toBe('1 дн назад')
    expect(formatRelativeTime(iso(6 * 24 * 60 * 60_000), now)).toBe('6 дн назад')
  })

  it('returns weeks for < 4 weeks', () => {
    expect(formatRelativeTime(iso(7 * 24 * 60 * 60_000), now)).toBe('1 нед назад')
    expect(formatRelativeTime(iso(21 * 24 * 60 * 60_000), now)).toBe('3 нед назад')
  })

  it('returns months for < 12 months', () => {
    expect(formatRelativeTime(iso(30 * 24 * 60 * 60_000), now)).toBe('1 мес назад')
    expect(formatRelativeTime(iso(90 * 24 * 60 * 60_000), now)).toBe('3 мес назад')
  })

  it('returns years for older dates', () => {
    expect(formatRelativeTime(iso(400 * 24 * 60 * 60_000), now)).toBe('1 г назад')
  })

  it('returns empty string for invalid ISO', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('')
  })

  it('returns "только что" at exactly now', () => {
    expect(formatRelativeTime(now.toISOString(), now)).toBe('только что')
  })
})
