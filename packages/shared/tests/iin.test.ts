import { describe, expect, it } from 'vitest'
import { iinSchema, isValidKzIin } from '../src/iin'

describe('isValidKzIin', () => {
  it('accepts a valid IIN with correct checksum', () => {
    expect(isValidKzIin('111111111110')).toBe(true)
    expect(isValidKzIin('123456789013')).toBe(true)
  })

  it('rejects wrong checksum', () => {
    expect(isValidKzIin('123456789012')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidKzIin('')).toBe(false)
  })

  it('rejects non-digit characters', () => {
    expect(isValidKzIin('12345678901a')).toBe(false)
  })

  it('rejects wrong length', () => {
    expect(isValidKzIin('12345')).toBe(false)
    expect(isValidKzIin('1234567890123')).toBe(false)
  })
})

describe('iinSchema', () => {
  it('trims whitespace and parses valid IIN', () => {
    expect(iinSchema.parse('  111111111110  ')).toBe('111111111110')
  })

  it('throws on wrong length (< 12)', () => {
    expect(() => iinSchema.parse('12345')).toThrow(/12 цифр/)
  })

  it('throws on wrong length (> 12)', () => {
    expect(() => iinSchema.parse('1234567890123')).toThrow()
  })

  it('throws on non-digit characters', () => {
    expect(() => iinSchema.parse('12345678901a')).toThrow(/только цифры/)
  })

  it('throws on invalid checksum', () => {
    expect(() => iinSchema.parse('123456789012')).toThrow(/Invalid Kazakhstani IIN/)
  })

  it('throws on empty string', () => {
    expect(() => iinSchema.parse('')).toThrow()
  })

  it('throws on non-string input', () => {
    expect(() => iinSchema.parse(111111111110)).toThrow()
  })
})
