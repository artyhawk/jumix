import type { ShiftWithRelations } from '@jumix/shared'
import { describe, expect, it } from 'vitest'
import { computeElapsed } from './use-shift-timer'

function makeShift(overrides: Partial<ShiftWithRelations> = {}): ShiftWithRelations {
  return {
    id: 'sh-1',
    craneId: 'c-1',
    operatorId: 'u-1',
    craneProfileId: 'cp-1',
    organizationId: 'org-1',
    siteId: 's-1',
    status: 'active',
    startedAt: '2026-04-24T09:00:00.000Z',
    endedAt: null,
    pausedAt: null,
    totalPauseSeconds: 0,
    notes: null,
    createdAt: '2026-04-24T09:00:00.000Z',
    updatedAt: '2026-04-24T09:00:00.000Z',
    crane: { id: 'c-1', model: 'Liebherr', inventoryNumber: null, type: 'tower', capacityTon: 10 },
    site: { id: 's-1', name: 'Site', address: null },
    organization: { id: 'org-1', name: 'Org' },
    operator: { id: 'cp-1', firstName: 'A', lastName: 'B', patronymic: null },
    ...overrides,
  }
}

describe('computeElapsed', () => {
  it('null shift → 0', () => {
    expect(computeElapsed(null, Date.now())).toBe(0)
  })

  it('active без pause → (now - startedAt)', () => {
    const started = new Date('2026-04-24T09:00:00Z').getTime()
    const now = started + 125_000 // 2 мин 5 сек
    const shift = makeShift({ startedAt: new Date(started).toISOString() })
    expect(computeElapsed(shift, now)).toBe(125)
  })

  it('active с totalPauseSeconds вычитает accumulated pauses', () => {
    const started = new Date('2026-04-24T09:00:00Z').getTime()
    const now = started + 3600_000 // 1 час
    const shift = makeShift({
      startedAt: new Date(started).toISOString(),
      totalPauseSeconds: 600, // 10 минут общих пауз
    })
    expect(computeElapsed(shift, now)).toBe(3600 - 600)
  })

  it('paused — добавляет current pause duration к accumulated', () => {
    const started = new Date('2026-04-24T09:00:00Z').getTime()
    const pausedAt = started + 600_000 // 10 мин работал
    const now = pausedAt + 120_000 // сидим 2 мин на паузе
    const shift = makeShift({
      startedAt: new Date(started).toISOString(),
      status: 'paused',
      pausedAt: new Date(pausedAt).toISOString(),
      totalPauseSeconds: 0,
    })
    // elapsed = (now - started) - 0 - (now - pausedAt) = 720 - 120 = 600
    expect(computeElapsed(shift, now)).toBe(600)
  })

  it('ended — использует endedAt вместо now', () => {
    const started = new Date('2026-04-24T09:00:00Z').getTime()
    const endedAt = started + 8 * 3600_000 // 8 часов
    const shift = makeShift({
      startedAt: new Date(started).toISOString(),
      status: 'ended',
      endedAt: new Date(endedAt).toISOString(),
      totalPauseSeconds: 1800, // 30 мин пауз
    })
    const now = endedAt + 10_000_000 // 3 часа спустя — должно ignore
    expect(computeElapsed(shift, now)).toBe(8 * 3600 - 1800)
  })

  it('negative elapsedMs clamps to 0', () => {
    const started = Date.now() + 1000
    const shift = makeShift({ startedAt: new Date(started).toISOString() })
    expect(computeElapsed(shift, Date.now())).toBe(0)
  })
})
