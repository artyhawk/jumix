import { describe, expect, it } from 'vitest'
import { applyPhoneMask, formatKzPhoneDisplay, toE164 } from './phone-format'

describe('applyPhoneMask', () => {
  it('formats progressively as user types digit-by-digit', () => {
    expect(applyPhoneMask('7').formatted).toBe('+7 7')
    expect(applyPhoneMask('70').formatted).toBe('+7 70')
    expect(applyPhoneMask('7010001122').formatted).toBe('+7 701 000 11 22')
  })

  it('strips leading 7 or 8 only when input has full 11 digits', () => {
    expect(applyPhoneMask('87010001122').digits).toBe('7010001122')
    expect(applyPhoneMask('77010001122').digits).toBe('7010001122')
  })

  it('truncates at 10 digits', () => {
    expect(applyPhoneMask('7701000112233').digits).toBe('7010001122')
  })

  it('strips non-digits', () => {
    const r = applyPhoneMask('+7 (701) 000-11-22')
    expect(r.digits).toBe('7010001122')
    expect(r.formatted).toBe('+7 701 000 11 22')
  })
})

describe('toE164', () => {
  it('builds valid E.164', () => {
    expect(toE164('7010001122')).toBe('+77010001122')
  })

  it('rejects non-10-digit inputs', () => {
    expect(toE164('123')).toBeNull()
    expect(toE164('70100011220')).toBeNull()
    expect(toE164('abc')).toBeNull()
  })
})

describe('formatKzPhoneDisplay', () => {
  it('formats E.164 to readable', () => {
    expect(formatKzPhoneDisplay('+77010001122')).toBe('+7 701 000 11 22')
  })

  it('returns input unchanged when invalid', () => {
    expect(formatKzPhoneDisplay('garbage')).toBe('garbage')
  })
})
