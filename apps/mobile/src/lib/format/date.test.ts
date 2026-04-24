import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  formatDate,
  formatExpiryCountdown,
  maxExpiryDate,
  toIsoDate,
  tomorrowDate,
  tomorrowIso,
} from './date'

describe('formatDate', () => {
  it('форматирует ISO в русскую дату', () => {
    expect(formatDate('2027-04-12T00:00:00Z')).toMatch(/12 апреля 2027/)
  })

  it('возвращает пустую строку для невалидного ISO', () => {
    expect(formatDate('not-a-date')).toBe('')
  })

  it('принимает Date объект', () => {
    expect(formatDate(new Date('2026-01-15T12:00:00Z'))).toMatch(/15 января 2026/)
  })
})

describe('daysUntil', () => {
  const NOW = new Date('2026-04-23T12:00:00Z')

  it('положительное число для будущей даты', () => {
    expect(daysUntil('2026-05-01T00:00:00Z', NOW)).toBe(8)
  })

  it('отрицательное для прошлой', () => {
    expect(daysUntil('2026-04-20T00:00:00Z', NOW)).toBe(-3)
  })

  it('0 для того же календарного дня', () => {
    expect(daysUntil('2026-04-23T23:59:00Z', NOW)).toBe(0)
  })

  it('0 при невалидном ISO', () => {
    expect(daysUntil('bogus', NOW)).toBe(0)
  })
})

describe('formatExpiryCountdown', () => {
  const NOW = new Date('2026-04-23T12:00:00Z')

  it('null → neutral "Не загружено"', () => {
    const r = formatExpiryCountdown(null, NOW)
    expect(r).toEqual({ text: 'Не загружено', tone: 'neutral', days: null })
  })

  it('expired → danger с plural дней назад', () => {
    const r = formatExpiryCountdown('2026-04-20T00:00:00Z', NOW)
    expect(r.tone).toBe('danger')
    expect(r.text).toBe('Просрочено 3 дня назад')
    expect(r.days).toBe(-3)
  })

  it('expires today → danger "Истекает сегодня"', () => {
    const r = formatExpiryCountdown('2026-04-23T23:59:00Z', NOW)
    expect(r.tone).toBe('danger')
    expect(r.text).toBe('Истекает сегодня')
    expect(r.days).toBe(0)
  })

  it('expires в течение 30 дней → warning', () => {
    const r = formatExpiryCountdown('2026-05-10T00:00:00Z', NOW)
    expect(r.tone).toBe('warning')
    expect(r.text).toBe('Через 17 дней')
  })

  it('expires далёко → ok с plural', () => {
    const r = formatExpiryCountdown('2027-04-12T00:00:00Z', NOW)
    expect(r.tone).toBe('ok')
    expect(r.text).toMatch(/^Через \d+ (день|дня|дней)$/)
  })

  it('edge case 1 день → "день" singular', () => {
    const r = formatExpiryCountdown('2026-04-24T12:00:00Z', NOW)
    expect(r.text).toBe('Через 1 день')
    expect(r.tone).toBe('warning')
  })
})

describe('toIsoDate', () => {
  it('форматирует Date → YYYY-MM-DD (local time, no UTC shift)', () => {
    expect(toIsoDate(new Date(2026, 3, 15))).toBe('2026-04-15') // month 0-indexed: 3=April
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(toIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('tomorrowIso / tomorrowDate', () => {
  const NOW = new Date(2026, 3, 23, 12, 0, 0)

  it('tomorrowDate возвращает +1 день', () => {
    expect(toIsoDate(tomorrowDate(NOW))).toBe('2026-04-24')
  })

  it('tomorrowIso возвращает YYYY-MM-DD +1 день', () => {
    expect(tomorrowIso(NOW)).toBe('2026-04-24')
  })
})

describe('maxExpiryDate', () => {
  const NOW = new Date(2026, 3, 23, 12, 0, 0)

  it('+20 лет от now', () => {
    const max = maxExpiryDate(NOW)
    expect(max.getFullYear()).toBe(2046)
    expect(max.getMonth()).toBe(3)
  })
})
