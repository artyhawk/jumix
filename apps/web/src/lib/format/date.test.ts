import { describe, expect, it } from 'vitest'
import { formatRuLongDate } from './date'

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
