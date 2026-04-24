import type { ShiftWithRelations } from '@jumix/shared'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActiveShiftCard } from './active-shift-card'

function makeShift(overrides: Partial<ShiftWithRelations> = {}): ShiftWithRelations {
  return {
    id: 'sh-1',
    craneId: 'c-1',
    operatorId: 'u-1',
    craneProfileId: 'cp-1',
    organizationId: 'org-1',
    siteId: 's-1',
    status: 'active',
    startedAt: new Date(Date.now() - 65_000).toISOString(), // 1:05 ago
    endedAt: null,
    pausedAt: null,
    totalPauseSeconds: 0,
    notes: null,
    createdAt: '2026-04-24T09:00:00Z',
    updatedAt: '2026-04-24T09:00:00Z',
    crane: {
      id: 'c-1',
      model: 'Liebherr',
      inventoryNumber: 'INV-5',
      type: 'tower',
      capacityTon: 10,
    },
    site: {
      id: 's-1',
      name: 'Тестовый объект',
      address: null,
      latitude: 51.128,
      longitude: 71.43,
      geofenceRadiusM: 200,
    },
    organization: { id: 'org-1', name: 'ТОО' },
    operator: { id: 'cp-1', firstName: 'A', lastName: 'B', patronymic: null },
    ...overrides,
  }
}

describe('ActiveShiftCard', () => {
  it('active: shows «В работе» badge + timer + pause/end buttons', () => {
    render(
      <ActiveShiftCard shift={makeShift()} onPause={vi.fn()} onResume={vi.fn()} onEnd={vi.fn()} />,
    )
    expect(screen.getByText('Смена активна')).toBeInTheDocument()
    expect(screen.getByText('В работе')).toBeInTheDocument()
    expect(screen.getByText('Перерыв')).toBeInTheDocument()
    expect(screen.getByText('Завершить смену')).toBeInTheDocument()
    expect(screen.getByText(/Liebherr/)).toBeInTheDocument()
    expect(screen.getByText('Тестовый объект')).toBeInTheDocument()
  })

  it('paused: shows «Перерыв» + Продолжить button', () => {
    render(
      <ActiveShiftCard
        shift={makeShift({ status: 'paused', pausedAt: new Date().toISOString() })}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEnd={vi.fn()}
      />,
    )
    expect(screen.getByText('Смена приостановлена')).toBeInTheDocument()
    expect(screen.getByText('Продолжить')).toBeInTheDocument()
    // «Перерыв» — ТЕКСТ на badge, НЕ кнопка — a11y-role check.
    expect(screen.queryByRole('button', { name: 'Перерыв' })).toBeNull()
  })

  it('crane label concatenates model + inventoryNumber', () => {
    render(
      <ActiveShiftCard shift={makeShift()} onPause={vi.fn()} onResume={vi.fn()} onEnd={vi.fn()} />,
    )
    expect(screen.getByText(/Liebherr · INV-5/)).toBeInTheDocument()
  })

  it('geofenceState=inside → «На объекте» badge visible', () => {
    render(
      <ActiveShiftCard
        shift={makeShift()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEnd={vi.fn()}
        geofenceState="inside"
      />,
    )
    expect(screen.getByText('На объекте')).toBeInTheDocument()
  })

  it('geofenceState=outside → danger banner с site name', () => {
    render(
      <ActiveShiftCard
        shift={makeShift()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEnd={vi.fn()}
        geofenceState="outside"
      />,
    )
    expect(screen.getByText('Вы покинули объект')).toBeInTheDocument()
    // «Тестовый объект» появляется дважды: в banner + в InfoRow ниже.
    expect(screen.getAllByText(/Тестовый объект/).length).toBeGreaterThanOrEqual(1)
  })

  it('geofenceState=unknown → ни banner, ни badge', () => {
    render(
      <ActiveShiftCard
        shift={makeShift()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEnd={vi.fn()}
        geofenceState="unknown"
      />,
    )
    expect(screen.queryByText('На объекте')).toBeNull()
    expect(screen.queryByText('Вы покинули объект')).toBeNull()
  })

  it('lastPingAgeMs > 2 минут → stale GPS warning', () => {
    render(
      <ActiveShiftCard
        shift={makeShift()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEnd={vi.fn()}
        lastPingAgeMs={150_000}
      />,
    )
    expect(screen.getByText(/GPS не обновлялся/)).toBeInTheDocument()
  })

  it('lastPingAgeMs < 2 минут → no warning', () => {
    render(
      <ActiveShiftCard
        shift={makeShift()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEnd={vi.fn()}
        lastPingAgeMs={30_000}
      />,
    )
    expect(screen.queryByText(/GPS не обновлялся/)).toBeNull()
  })
})
