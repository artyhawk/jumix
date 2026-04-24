import { describe, expect, it } from 'vitest'
import { formatDuration, formatTime } from './duration'

describe('formatDuration', () => {
  it('0 seconds → 00:00', () => {
    expect(formatDuration(0)).toBe('00:00')
  })

  it('< 1 hour → MM:SS', () => {
    expect(formatDuration(59)).toBe('00:59')
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(3599)).toBe('59:59')
  })

  it('>= 1 hour → H:MM:SS', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3661)).toBe('1:01:01')
    expect(formatDuration(3 * 3600 + 5 * 60 + 7)).toBe('3:05:07')
  })

  it('negative clamps to 0', () => {
    expect(formatDuration(-100)).toBe('00:00')
  })

  it('fractional seconds truncated', () => {
    expect(formatDuration(65.9)).toBe('01:05')
  })
})

describe('formatTime', () => {
  it('HH:MM от ISO string (local time)', () => {
    const iso = new Date(2026, 3, 24, 9, 30, 0).toISOString()
    expect(formatTime(iso)).toBe('09:30')
  })
})
