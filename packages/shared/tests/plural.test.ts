import { describe, expect, it } from 'vitest'
import { pluralRu } from '../src/format/plural'

describe('pluralRu', () => {
  const days = ['день', 'дня', 'дней'] as const

  it('form 2 (plural / genitive) для 0', () => {
    expect(pluralRu(0, days)).toBe('дней')
  })

  it('form 0 (singular) для 1, 21, 101', () => {
    expect(pluralRu(1, days)).toBe('день')
    expect(pluralRu(21, days)).toBe('день')
    expect(pluralRu(101, days)).toBe('день')
  })

  it('form 1 (2-4) для 2, 3, 4, 22, 23', () => {
    expect(pluralRu(2, days)).toBe('дня')
    expect(pluralRu(3, days)).toBe('дня')
    expect(pluralRu(4, days)).toBe('дня')
    expect(pluralRu(22, days)).toBe('дня')
    expect(pluralRu(23, days)).toBe('дня')
  })

  it('form 2 для 5..10, 11..14, 15..20', () => {
    expect(pluralRu(5, days)).toBe('дней')
    expect(pluralRu(10, days)).toBe('дней')
    expect(pluralRu(11, days)).toBe('дней')
    expect(pluralRu(12, days)).toBe('дней')
    expect(pluralRu(14, days)).toBe('дней')
    expect(pluralRu(15, days)).toBe('дней')
    expect(pluralRu(20, days)).toBe('дней')
  })

  it('корректен на negative и больших числах', () => {
    expect(pluralRu(-1, days)).toBe('день')
    expect(pluralRu(-5, days)).toBe('дней')
    expect(pluralRu(1001, days)).toBe('день')
    expect(pluralRu(1005, days)).toBe('дней')
  })
})
