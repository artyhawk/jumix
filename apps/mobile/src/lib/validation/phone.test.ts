import { describe, expect, it } from 'vitest'
import { formatPhoneMask, phoneDigits, toE164 } from './phone'

describe('phoneDigits', () => {
  it('extracts 10 digits from formatted input', () => {
    expect(phoneDigits('(701) 000-11-22')).toBe('7010001122')
  })

  it('strips leading 7 if length >= 11', () => {
    expect(phoneDigits('+77010001122')).toBe('7010001122')
  })

  it('strips leading 8 (legacy KZ input)', () => {
    expect(phoneDigits('87010001122')).toBe('7010001122')
  })

  it('keeps short input без strip (sequential typing preservation)', () => {
    expect(phoneDigits('7')).toBe('7')
    expect(phoneDigits('77')).toBe('77')
  })

  it('truncates if more than 10 digits', () => {
    expect(phoneDigits('+770100011223344')).toBe('7010001122')
  })
})

describe('formatPhoneMask', () => {
  it('empty → empty', () => {
    expect(formatPhoneMask('')).toBe('')
  })

  it('1-3 digits → (XXX', () => {
    expect(formatPhoneMask('701')).toBe('(701')
  })

  it('4-6 digits → (XXX) XXX', () => {
    expect(formatPhoneMask('701000')).toBe('(701) 000')
  })

  it('7-8 digits → (XXX) XXX-XX', () => {
    expect(formatPhoneMask('70100011')).toBe('(701) 000-11')
  })

  it('9-10 digits → (XXX) XXX-XX-XX', () => {
    expect(formatPhoneMask('7010001122')).toBe('(701) 000-11-22')
  })
})

describe('toE164', () => {
  it('returns E.164 for full 10-digit input', () => {
    expect(toE164('7010001122')).toBe('+77010001122')
  })

  it('returns undefined for incomplete input', () => {
    expect(toE164('701')).toBeUndefined()
    expect(toE164('')).toBeUndefined()
  })
})
