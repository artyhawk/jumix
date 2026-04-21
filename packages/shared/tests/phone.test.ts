import { describe, expect, it } from 'vitest'
import { isValidKzPhone, maskPhone, normalizePhone, phoneSchema } from '../src/phone'

describe('normalizePhone', () => {
  const valid: Array<[string, string]> = [
    ['+77010001122', '+77010001122'],
    ['77010001122', '+77010001122'],
    ['87010001122', '+77010001122'],
    ['7010001122', '+77010001122'],
    ['+7 (701) 000-11-22', '+77010001122'],
    ['8 701 000 11 22', '+77010001122'],
    ['  +77010001122  ', '+77010001122'],
    ['+7 747 123 45 67', '+77471234567'],
  ]

  for (const [input, expected] of valid) {
    it(`normalizes "${input}" → "${expected}"`, () => {
      expect(normalizePhone(input)).toBe(expected)
    })
  }

  const invalid: string[] = [
    '',
    '   ',
    'not a phone',
    '1234',
    '+1 555 555 0100', // US
    '+44 20 7946 0958', // UK
    '+74951234567', // RU landline (Moscow)
    '+78124567890', // RU landline (SPb)
    '701', // too short
    '+77010001122000', // too long
  ]

  for (const input of invalid) {
    it(`rejects "${input}"`, () => {
      expect(normalizePhone(input)).toBeNull()
    })
  }
})

describe('isValidKzPhone', () => {
  it('returns true for valid KZ number', () => {
    expect(isValidKzPhone('+77010001122')).toBe(true)
  })

  it('returns false for garbage', () => {
    expect(isValidKzPhone('abc')).toBe(false)
  })
})

describe('maskPhone', () => {
  it('masks a valid E.164 KZ phone', () => {
    expect(maskPhone('+77010001122')).toBe('+7******1122')
  })

  it('returns input unchanged when not in E.164 KZ format', () => {
    // Защита от случайной маскировки невалидной строки — пусть падает явно
    // на валидации выше, не тихо «маскируется».
    expect(maskPhone('garbage')).toBe('garbage')
    expect(maskPhone('+12025550100')).toBe('+12025550100')
  })
})

describe('phoneSchema', () => {
  it('parses and normalizes raw input to E.164', () => {
    const result = phoneSchema.parse('8 (701) 000-11-22')
    expect(result).toBe('+77010001122')
  })

  it('throws ZodError on invalid input', () => {
    expect(() => phoneSchema.parse('garbage')).toThrow(/Invalid Kazakhstani phone/)
  })

  it('rejects empty string', () => {
    expect(() => phoneSchema.parse('')).toThrow()
  })

  it('rejects non-KZ numbers', () => {
    expect(() => phoneSchema.parse('+1 555 555 0100')).toThrow(/Invalid Kazakhstani phone/)
  })
})
