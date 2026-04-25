import type { ShiftWithRelations } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/shifts', () => ({
  getShift: vi.fn(),
  getShiftPath: vi.fn(),
  listLatestLocations: vi.fn(),
  listOwnerShifts: vi.fn(),
  listMyShifts: vi.fn(),
  getMyActiveShift: vi.fn(),
  getAvailableCranes: vi.fn(),
  startShift: vi.fn(),
  pauseShift: vi.fn(),
  resumeShift: vi.fn(),
  endShift: vi.fn(),
}))

// Mock map components — WebGL в jsdom не работает
vi.mock('@/components/map/base-map', () => ({
  BaseMap: ({ className }: { className?: string }) => (
    <div data-testid="base-map" className={className} />
  ),
}))
vi.mock('@/components/map/sites-layer', () => ({
  SitesLayer: () => <div data-testid="sites-layer" />,
}))
vi.mock('@/components/map/shift-path-layer', () => ({
  ShiftPathLayer: ({ pings }: { pings: unknown[] }) => (
    <div data-testid="shift-path-layer" data-pings={pings.length} />
  ),
}))

import * as shiftsApi from '@/lib/api/shifts'
import { ShiftDrawer } from './shift-drawer'

const getShift = vi.mocked(shiftsApi.getShift)
const getShiftPath = vi.mocked(shiftsApi.getShiftPath)

function makeShift(overrides: Partial<ShiftWithRelations> = {}): ShiftWithRelations {
  return {
    id: 'sh-1',
    craneId: 'c-1',
    operatorId: 'u-1',
    craneProfileId: 'cp-1',
    organizationId: 'org-1',
    siteId: 's-1',
    status: 'active',
    startedAt: '2026-04-25T09:00:00Z',
    endedAt: null,
    pausedAt: null,
    totalPauseSeconds: 0,
    notes: null,
    createdAt: '2026-04-25T09:00:00Z',
    updatedAt: '2026-04-25T09:00:00Z',
    crane: {
      id: 'c-1',
      model: 'Liebherr 550',
      inventoryNumber: 'INV-001',
      type: 'tower',
      capacityTon: 12,
    },
    site: {
      id: 's-1',
      name: 'ЖК Астана Парк',
      address: 'ул. Абая, 15',
      latitude: 51.128,
      longitude: 71.43,
      geofenceRadiusM: 200,
    },
    organization: { id: 'org-1', name: 'Org' },
    operator: { id: 'cp-1', firstName: 'Иван', lastName: 'Петров', patronymic: null },
    ...overrides,
  }
}

function renderDrawer(id: string | null) {
  const { Wrapper } = createQueryWrapper()
  return render(<ShiftDrawer id={id} onOpenChange={() => {}} />, { wrapper: Wrapper })
}

beforeEach(() => {
  getShift.mockReset()
  getShiftPath.mockReset()
  getShiftPath.mockResolvedValue({ shiftId: 'sh-1', pings: [] })
})

describe('ShiftDrawer', () => {
  it('does not render when id is null', () => {
    renderDrawer(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders shift details when id provided', async () => {
    getShift.mockResolvedValueOnce(makeShift())
    renderDrawer('sh-1')
    await waitFor(() => {
      expect(screen.getByText(/Петров Иван/)).toBeInTheDocument()
    })
    // Liebherr 550 появляется в DrawerTitle + в link — обе секции
    expect(screen.getAllByText(/Liebherr 550/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/ЖК Астана Парк/)).toBeInTheDocument()
    expect(screen.getByText('На смене')).toBeInTheDocument()
  })

  it('renders ended shift with endedAt row', async () => {
    getShift.mockResolvedValueOnce(makeShift({ status: 'ended', endedAt: '2026-04-25T11:00:00Z' }))
    renderDrawer('sh-1')
    await screen.findByText('Завершена')
    expect(screen.getByText('Окончание')).toBeInTheDocument()
  })

  it('renders paused shift with pending badge', async () => {
    getShift.mockResolvedValueOnce(
      makeShift({ status: 'paused', pausedAt: '2026-04-25T10:00:00Z' }),
    )
    renderDrawer('sh-1')
    await screen.findByText('Перерыв')
  })

  it('renders ShiftPathLayer with loaded pings', async () => {
    getShift.mockResolvedValueOnce(makeShift())
    getShiftPath.mockResolvedValueOnce({
      shiftId: 'sh-1',
      pings: [
        {
          latitude: 51.1,
          longitude: 71.1,
          accuracyMeters: 10,
          recordedAt: '2026-04-25T09:15:00Z',
          insideGeofence: true,
        },
        {
          latitude: 51.11,
          longitude: 71.11,
          accuracyMeters: 10,
          recordedAt: '2026-04-25T09:30:00Z',
          insideGeofence: true,
        },
      ],
    })
    renderDrawer('sh-1')
    await waitFor(() => {
      const layer = screen.getByTestId('shift-path-layer')
      expect(layer.dataset.pings).toBe('2')
    })
    expect(screen.getByText('2 пинга')).toBeInTheDocument()
  })

  it('shows «Нет данных GPS» when pings empty', async () => {
    getShift.mockResolvedValueOnce(makeShift())
    getShiftPath.mockResolvedValueOnce({ shiftId: 'sh-1', pings: [] })
    renderDrawer('sh-1')
    await waitFor(() => {
      expect(screen.getByText('Нет данных GPS')).toBeInTheDocument()
    })
  })

  it('shows error state when getShift fails', async () => {
    getShift.mockRejectedValueOnce(new Error('Server error'))
    renderDrawer('sh-1')
    await waitFor(() => {
      expect(screen.getByText('Не удалось загрузить смену')).toBeInTheDocument()
    })
  })

  it('links to crane, crane-profile, site pages', async () => {
    getShift.mockResolvedValueOnce(makeShift())
    renderDrawer('sh-1')
    await screen.findByText(/Петров Иван/)
    expect(screen.getByRole('link', { name: /Петров Иван/ })).toHaveAttribute(
      'href',
      '/crane-profiles?open=cp-1',
    )
    expect(screen.getByRole('link', { name: /Liebherr 550/ })).toHaveAttribute(
      'href',
      '/my-cranes?open=c-1',
    )
    expect(screen.getByRole('link', { name: /ЖК Астана Парк/ })).toHaveAttribute(
      'href',
      '/sites?open=s-1',
    )
  })
})
