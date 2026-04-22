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

  it('does not double-count the rendered +7 prefix during incremental typing', () => {
    // Display was "+7 7", user types "0" → browser emits "+7 70".
    // Digit "7" from the literal prefix must NOT be counted as user input.
    expect(applyPhoneMask('+7 70').digits).toBe('70')
    expect(applyPhoneMask('+7 70').formatted).toBe('+7 70')
    // Longer chain — last digit just appended by user.
    expect(applyPhoneMask('+7 701 000 112').digits).toBe('701000112')
    expect(applyPhoneMask('+7 701 000 112').formatted).toBe('+7 701 000 11 2')
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
