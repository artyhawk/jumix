import { describe, expect, it } from 'vitest'
import { round6 } from '../src/lib/coords'

describe('round6 (coordinate precision)', () => {
  it('preserves already-6-digit values exactly', () => {
    expect(round6(71.430603)).toBe(71.430603) // Астана, EXPO
    expect(round6(51.128722)).toBe(51.128722)
    expect(round6(-45.123456)).toBe(-45.123456)
  })

  it('truncates extra precision (7th digit rounds)', () => {
    expect(round6(71.4306034)).toBe(71.430603) // rounds down
    expect(round6(71.4306036)).toBe(71.430604) // rounds up
    expect(round6(-45.1234561)).toBe(-45.123456)
  })

  it('handles exact-half input deterministically (implementation-defined tie-break)', () => {
    // toFixed не гарантирует half-to-even (поведение implementation-defined).
    // Проверяем только что результат стабильный и в пределах ±1 единицы
    // последнего знака — для GPS (accuracy 3-5 м vs шаг округления 11 см)
    // разница неразличима.
    const positive = round6(71.4306035)
    expect([71.430603, 71.430604]).toContain(positive)
    const negative = round6(-45.1234565)
    expect([-45.123457, -45.123456]).toContain(negative)
  })

  it('handles zero and boundary values', () => {
    expect(round6(0)).toBe(0)
    expect(round6(90)).toBe(90)
    expect(round6(-180)).toBe(-180)
  })

  it('throws on non-finite input', () => {
    expect(() => round6(Number.NaN)).toThrow()
    expect(() => round6(Number.POSITIVE_INFINITY)).toThrow()
    expect(() => round6(Number.NEGATIVE_INFINITY)).toThrow()
  })
})
