import { describe, expect, it } from 'vitest'
import { binSchema, isValidKzBin } from '../src/bin'

describe('isValidKzBin', () => {
  // Hand-computed valid BINs (check-digit из алгоритма ниже).
  // `111111111110` — первый проход: sum=66, 66%11=0 → check=0, совпадает с d11.
  // `100000000011` — первый проход: sum=12, 12%11=1 → check=1, совпадает с d11.
  // `123456789013` — первый проход даёт остаток 10, фолбэк на w2 даёт 3, совпадает с d11.
  const valid = ['111111111110', '100000000011', '123456789013']
  for (const bin of valid) {
    it(`accepts valid BIN "${bin}"`, () => {
      expect(isValidKzBin(bin)).toBe(true)
    })
  }

  const invalid: Array<[string, string]> = [
    ['', 'empty'],
    ['12345', 'too short'],
    ['1234567890123', 'too long'],
    ['12345678901a', 'contains letter'],
    ['123 456 789 013', 'contains spaces'],
    ['123456789012', 'wrong check digit (computed 3, given 2)'],
    ['111111111111', 'wrong check digit (computed 0, given 1)'],
    ['100000000012', 'wrong check digit (computed 1, given 2)'],
  ]

  for (const [bin, reason] of invalid) {
    it(`rejects "${bin}" — ${reason}`, () => {
      expect(isValidKzBin(bin)).toBe(false)
    })
  }
})

describe('binSchema', () => {
  it('trims whitespace and validates', () => {
    expect(binSchema.parse('  123456789013  ')).toBe('123456789013')
  })

  it('throws on invalid BIN', () => {
    expect(() => binSchema.parse('123456789012')).toThrow(/Invalid Kazakhstani BIN/)
  })

  it('throws on non-string', () => {
    expect(() => binSchema.parse(123456789013)).toThrow()
  })
})
