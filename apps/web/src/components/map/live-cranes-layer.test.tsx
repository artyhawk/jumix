import type { ActiveShiftLocation } from '@/lib/api/types'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { addTo, setLngLat, remove, markerCtor } = vi.hoisted(() => {
  const remove = vi.fn()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance: any = {}
  const setLngLat = vi.fn(() => instance)
  const addTo = vi.fn(() => instance)
  instance.setLngLat = setLngLat
  instance.addTo = addTo
  instance.remove = remove
  const markerCtor = vi.fn<(opts: { element: HTMLElement }) => typeof instance>(() => instance)
  return { addTo, setLngLat, remove, markerCtor }
})

vi.mock('maplibre-gl', () => ({
  default: { Marker: markerCtor },
  Marker: markerCtor,
}))

import { LiveCranesLayer, getLiveCraneTone } from './live-cranes-layer'

function makeLocation(overrides: Partial<ActiveShiftLocation> = {}): ActiveShiftLocation {
  return {
    shiftId: 'sh-1',
    craneId: 'c-1',
    operatorId: 'op-1',
    siteId: 's-1',
    latitude: 51.1,
    longitude: 71.1,
    accuracyMeters: 12,
    recordedAt: '2026-04-25T10:00:00Z',
    insideGeofence: true,
    minutesSinceLastPing: 2,
    crane: {
      id: 'c-1',
      model: 'Liebherr 550',
      inventoryNumber: 'INV-1',
      type: 'tower',
      capacityTon: 10,
    },
    operator: { id: 'op-1', firstName: 'Иван', lastName: 'Петров', patronymic: null },
    site: { id: 's-1', name: 'Site', address: null },
    ...overrides,
  }
}

const fakeMap = {} as unknown as Parameters<typeof LiveCranesLayer>[0]['map']

beforeEach(() => {
  markerCtor.mockClear()
  setLngLat.mockClear()
  addTo.mockClear()
  remove.mockClear()
})

describe('getLiveCraneTone', () => {
  it('stale (>10 min) wins over geofence state', () => {
    expect(getLiveCraneTone(makeLocation({ minutesSinceLastPing: 11, insideGeofence: true }))).toBe(
      'warning',
    )
    expect(
      getLiveCraneTone(makeLocation({ minutesSinceLastPing: 11, insideGeofence: false })),
    ).toBe('warning')
  })

  it('fresh + outside → danger', () => {
    expect(getLiveCraneTone(makeLocation({ minutesSinceLastPing: 2, insideGeofence: false }))).toBe(
      'danger',
    )
  })

  it('fresh + inside → success', () => {
    expect(getLiveCraneTone(makeLocation({ minutesSinceLastPing: 2, insideGeofence: true }))).toBe(
      'success',
    )
  })

  it('fresh + unknown → neutral', () => {
    expect(getLiveCraneTone(makeLocation({ minutesSinceLastPing: 2, insideGeofence: null }))).toBe(
      'neutral',
    )
  })
})

describe('LiveCranesLayer', () => {
  it('returns null when map is null', () => {
    render(<LiveCranesLayer map={null} locations={[makeLocation()]} />)
    expect(markerCtor).not.toHaveBeenCalled()
  })

  it('renders one marker per location at ping coords', () => {
    const locs = [
      makeLocation({ shiftId: 'sh-1', latitude: 51.1, longitude: 71.1 }),
      makeLocation({ shiftId: 'sh-2', latitude: 51.2, longitude: 71.2 }),
    ]
    render(<LiveCranesLayer map={fakeMap} locations={locs} />)
    expect(markerCtor).toHaveBeenCalledTimes(2)
    expect(setLngLat).toHaveBeenNthCalledWith(1, [71.1, 51.1])
    expect(setLngLat).toHaveBeenNthCalledWith(2, [71.2, 51.2])
  })

  it('exposes semantic tone via data attribute', () => {
    render(
      <LiveCranesLayer
        map={fakeMap}
        locations={[makeLocation({ minutesSinceLastPing: 15, insideGeofence: true })]}
      />,
    )
    const element = markerCtor.mock.calls[0]?.[0]?.element
    expect(element?.dataset.tone).toBe('warning')
  })

  it('click triggers onLocationClick with location', () => {
    const onClick = vi.fn()
    render(<LiveCranesLayer map={fakeMap} locations={[makeLocation()]} onLocationClick={onClick} />)
    const element = markerCtor.mock.calls[0]?.[0]?.element
    element?.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClick.mock.calls[0]?.[0]?.shiftId).toBe('sh-1')
  })

  it('aria-label includes operator + minutes', () => {
    render(
      <LiveCranesLayer map={fakeMap} locations={[makeLocation({ minutesSinceLastPing: 3 })]} />,
    )
    const element = markerCtor.mock.calls[0]?.[0]?.element
    expect(element?.getAttribute('aria-label')).toContain('Петров Иван')
    expect(element?.getAttribute('aria-label')).toContain('3 мин')
  })
})
