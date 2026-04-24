import type { ShiftWithRelations } from '@jumix/shared'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShiftHistoryRow, computeShiftDurationSeconds } from './shift-history-row'

function makeShift(overrides: Partial<ShiftWithRelations> = {}): ShiftWithRelations {
  return {
    id: 'sh-1',
    craneId: 'c-1',
    operatorId: 'u-1',
    craneProfileId: 'cp-1',
    organizationId: 'org-1',
    siteId: 's-1',
    status: 'ended',
    startedAt: '2026-04-24T08:00:00Z',
    endedAt: '2026-04-24T17:00:00Z', // 9 часов
    pausedAt: null,
    totalPauseSeconds: 1800, // 30 минут перерыв
    notes: null,
    createdAt: '2026-04-24T08:00:00Z',
    updatedAt: '2026-04-24T17:00:00Z',
    crane: { id: 'c-1', model: 'Liebherr', inventoryNumber: null, type: 'tower', capacityTon: 10 },
    site: {
      id: 's-1',
      name: 'Site',
      address: null,
      latitude: 51.128,
      longitude: 71.43,
      geofenceRadiusM: 200,
    },
    organization: { id: 'org-1', name: 'Org' },
    operator: { id: 'cp-1', firstName: 'A', lastName: 'B', patronymic: null },
    ...overrides,
  }
}

describe('computeShiftDurationSeconds', () => {
  it('ended shift: (ended-started) - pauses', () => {
    const shift = makeShift()
    // 9 часов = 32400, minus 1800 pause = 30600
    expect(computeShiftDurationSeconds(shift)).toBe(30600)
  })

  it('non-ended shift → 0', () => {
    expect(computeShiftDurationSeconds(makeShift({ status: 'active', endedAt: null }))).toBe(0)
  })

  it('clamps negative to 0', () => {
    // impossible but safety
    expect(computeShiftDurationSeconds(makeShift({ totalPauseSeconds: 999999 }))).toBe(0)
  })
})

describe('ShiftHistoryRow', () => {
  it('renders crane + site + formatted duration', () => {
    render(<ShiftHistoryRow shift={makeShift()} onPress={vi.fn()} />)
    expect(screen.getByText('Liebherr')).toBeInTheDocument()
    expect(screen.getByText('Site')).toBeInTheDocument()
    // 30600 = 8:30:00
    expect(screen.getByText('8:30:00')).toBeInTheDocument()
  })
})
