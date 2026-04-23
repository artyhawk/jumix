import { describe, expect, it } from 'vitest'
import { daysUntil, formatDate, formatExpiryCountdown } from './date'

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
