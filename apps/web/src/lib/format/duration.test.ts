import { describe, expect, it } from 'vitest'
import { computeShiftDurationSeconds, formatDuration, formatDurationHuman } from './duration'

describe('formatDuration', () => {
  it('MM:SS for < 1h', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(3599)).toBe('59:59')
  })

  it('HH:MM:SS for >= 1h', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3661)).toBe('1:01:01')
    expect(formatDuration(36000)).toBe('10:00:00')
  })

  it('clamps negatives to 0', () => {
    expect(formatDuration(-5)).toBe('00:00')
  })

  it('truncates fractional seconds', () => {
    expect(formatDuration(65.9)).toBe('01:05')
  })
})

describe('formatDurationHuman', () => {
  it('меньше минуты', () => {
    expect(formatDurationHuman(0)).toBe('меньше минуты')
    expect(formatDurationHuman(45)).toBe('меньше минуты')
  })

  it('минуты only', () => {
    expect(formatDurationHuman(60)).toBe('1 мин')
    expect(formatDurationHuman(3540)).toBe('59 мин')
  })

  it('только часы', () => {
    expect(formatDurationHuman(3600)).toBe('1 ч')
  })

  it('часы + минуты', () => {
    expect(formatDurationHuman(3660)).toBe('1 ч 1 мин')
    expect(formatDurationHuman(7200)).toBe('2 ч')
    expect(formatDurationHuman(3720)).toBe('1 ч 2 мин')
  })
})

describe('computeShiftDurationSeconds', () => {
  const now = new Date('2026-04-25T12:00:00Z')

  it('active: end-now minus pauses', () => {
    const seconds = computeShiftDurationSeconds(
      {
        startedAt: '2026-04-25T10:00:00Z',
        endedAt: null,
        pausedAt: null,
        totalPauseSeconds: 300,
        status: 'active',
      },
      now,
    )
    // 2h elapsed - 300s pause = 7200 - 300 = 6900
    expect(seconds).toBe(6900)
  })

  it('paused: subtracts ongoing pause', () => {
    const seconds = computeShiftDurationSeconds(
      {
        startedAt: '2026-04-25T10:00:00Z',
        endedAt: null,
        pausedAt: '2026-04-25T11:30:00Z',
        totalPauseSeconds: 0,
        status: 'paused',
      },
      now,
    )
    // 2h elapsed - 30min active pause = 7200 - 1800 = 5400
    expect(seconds).toBe(5400)
  })

  it('ended: uses endedAt, ignores now', () => {
    const seconds = computeShiftDurationSeconds(
      {
        startedAt: '2026-04-25T10:00:00Z',
        endedAt: '2026-04-25T11:00:00Z',
        pausedAt: null,
        totalPauseSeconds: 0,
        status: 'ended',
      },
      now,
    )
    expect(seconds).toBe(3600)
  })

  it('never negative', () => {
    const seconds = computeShiftDurationSeconds(
      {
        startedAt: '2026-04-25T10:00:00Z',
        endedAt: null,
        pausedAt: null,
        totalPauseSeconds: 10000,
        status: 'active',
      },
      now,
    )
    expect(seconds).toBe(0)
  })
})
