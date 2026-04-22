import { describe, expect, it } from 'vitest'
import { validateKz12DigitChecksum } from '../src/kz-checksum'

describe('validateKz12DigitChecksum', () => {
  // Hand-computed valid 12-digit values — one from each weight-table branch.
  // `111111111110` — первый проход: sum=66, 66%11=0 → check=0 (primary weights).
  // `100000000011` — первый проход: sum=12, 12%11=1 → check=1 (primary weights).
  // `123456789013` — первый проход даёт остаток 10, фолбэк на w2 даёт 3 (alternate weights).
  const valid = ['111111111110', '100000000011', '123456789013']
  for (const value of valid) {
    it(`accepts valid value "${value}"`, () => {
      expect(validateKz12DigitChecksum(value)).toBe(true)
    })
  }

  it('accepts value that requires alternate-weights fallback', () => {
    // `123456789013` specifically exercises the `check === 10` branch on w1.
    expect(validateKz12DigitChecksum('123456789013')).toBe(true)
  })

  const invalid: Array<[string, string]> = [
    ['', 'empty'],
    ['12345', 'too short'],
    ['1234567890123', 'too long'],
    ['12345678901a', 'contains letter'],
    ['123 456 789 013', 'contains spaces'],
    ['123456789012', 'wrong check digit (computed 3, given 2)'],
    ['111111111111', 'wrong check digit (computed 0, given 1)'],
    ['100000000012', 'wrong check digit (computed 1, given 2)'],
    ['00000000000a', 'leading zeros with trailing letter'],
  ]

  for (const [value, reason] of invalid) {
    it(`rejects "${value}" — ${reason}`, () => {
      expect(validateKz12DigitChecksum(value)).toBe(false)
    })
  }

  it('accepts values with leading zeros when checksum is correct', () => {
    // `000000000000` — sum=0, 0%11=0 → check=0 matches d11.
    expect(validateKz12DigitChecksum('000000000000')).toBe(true)
  })
})
