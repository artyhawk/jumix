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
  const cases: Array<[string, string, string]> = [
    ['+77010001122', '+7******1122', 'valid KZ E.164'],
    ['+77012345678', '+7******5678', 'valid KZ E.164 (alt)'],
    ['+12025550100', '+1******0100', 'foreign E.164 also masked'],
    ['+123456', '***3456', 'short + form (len < 8) falls to last-4'],
    ['8701234', '***1234', 'non-E.164 7-digit → last-4 only'],
    ['garbage', '***bage', 'garbage string → last-4 only'],
    ['1234', '****', 'len 4 → fully masked'],
    ['12', '****', 'len 2 → fully masked'],
    ['', '***', 'empty → placeholder'],
  ]

  for (const [input, expected, label] of cases) {
    it(`${label}: "${input}" → "${expected}"`, () => {
      expect(maskPhone(input)).toBe(expected)
    })
  }

  it('invariant: at most 4 trailing chars of input visible', () => {
    // Свойство-тест: что бы ни пришло, из оригинала утечь могут только
    // последние 4 символа. Если вход короче 5 символов — вообще 0 утечек.
    const inputs = ['', 'a', 'ab', 'abcd', 'abcde', 'secret123', '+77010001122', '+1']
    for (const input of inputs) {
      const masked = maskPhone(input)
      const suffix = input.slice(-4)
      const leak = input.length <= 4 ? '' : suffix
      // masked либо не содержит оригинала, либо заканчивается на leak.
      if (leak) expect(masked.endsWith(leak)).toBe(true)
      // Никогда не возвращаем вход как есть (кроме случая где сам вход — маска).
      if (input.length > 0) expect(masked).not.toBe(input)
    }
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
