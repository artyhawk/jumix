import type { LocationPing } from '@/lib/api/types'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockMap = any

function makeMockMap() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Set<string>()
  const addSource = vi.fn((id: string, _spec: unknown) => {
    sources.set(id, { setData: vi.fn() })
  })
  const getSource = vi.fn((id: string) => sources.get(id))
  const addLayer = vi.fn((spec: { id: string }) => {
    layers.add(spec.id)
  })
  const getLayer = vi.fn((id: string) => (layers.has(id) ? { id } : undefined))
  const removeLayer = vi.fn((id: string) => {
    layers.delete(id)
  })
  const removeSource = vi.fn((id: string) => {
    sources.delete(id)
  })
  return {
    addSource,
    getSource,
    addLayer,
    getLayer,
    removeLayer,
    removeSource,
    _sources: sources,
    _layers: layers,
  }
}

vi.mock('maplibre-gl', () => ({
  default: {},
  Marker: vi.fn(),
}))

import { ShiftPathLayer } from './shift-path-layer'

function makePing(overrides: Partial<LocationPing> = {}): LocationPing {
  return {
    latitude: 51.1,
    longitude: 71.1,
    accuracyMeters: 10,
    recordedAt: '2026-04-25T10:00:00Z',
    insideGeofence: true,
    ...overrides,
  }
}

let mockMap: ReturnType<typeof makeMockMap>

beforeEach(() => {
  mockMap = makeMockMap()
})

describe('ShiftPathLayer', () => {
  it('returns null when map is null', () => {
    const { container } = render(<ShiftPathLayer map={null} pings={[makePing()]} />)
    expect(container.firstChild).toBeNull()
  })

  it('creates line + endpoints sources + layers on first mount', () => {
    const pings = [makePing({ longitude: 71.1 }), makePing({ longitude: 71.2 })]
    render(<ShiftPathLayer map={mockMap as MockMap} pings={pings} />)
    expect(mockMap.addSource).toHaveBeenCalledWith('shift-path-source', expect.any(Object))
    expect(mockMap.addSource).toHaveBeenCalledWith(
      'shift-path-endpoints-source',
      expect.any(Object),
    )
    expect(mockMap.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'shift-path-line', type: 'line' }),
    )
    expect(mockMap.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'shift-path-points', type: 'circle' }),
    )
  })

  it('supports custom id for multiple instances on same map', () => {
    render(<ShiftPathLayer map={mockMap as MockMap} pings={[makePing()]} id="my-path" />)
    expect(mockMap.addSource).toHaveBeenCalledWith('my-path-source', expect.any(Object))
    expect(mockMap.addSource).toHaveBeenCalledWith('my-path-endpoints-source', expect.any(Object))
  })

  it('line data is LineString (via setData) when >= 2 pings', () => {
    const pings = [
      makePing({ longitude: 71.1, latitude: 51.1 }),
      makePing({ longitude: 71.2, latitude: 51.2 }),
    ]
    render(<ShiftPathLayer map={mockMap as MockMap} pings={pings} />)
    const lineSource = mockMap._sources.get('shift-path-source')
    expect(lineSource?.setData).toHaveBeenCalled()
    const lastCall = lineSource?.setData.mock.calls.at(
      -1,
    )?.[0] as GeoJSON.Feature<GeoJSON.LineString>
    expect(lastCall.type).toBe('Feature')
    expect(lastCall.geometry.type).toBe('LineString')
    expect(lastCall.geometry.coordinates).toEqual([
      [71.1, 51.1],
      [71.2, 51.2],
    ])
  })

  it('empty FeatureCollection when pings has < 2 points', () => {
    render(<ShiftPathLayer map={mockMap as MockMap} pings={[makePing()]} />)
    const lineSource = mockMap._sources.get('shift-path-source')
    const lastCall = lineSource?.setData.mock.calls.at(-1)?.[0] as GeoJSON.FeatureCollection
    expect(lastCall.type).toBe('FeatureCollection')
    expect(lastCall.features).toEqual([])
  })

  it('endpoints has start + end when >= 2 pings', () => {
    const pings = [
      makePing({ longitude: 71.1, latitude: 51.1 }),
      makePing({ longitude: 71.2, latitude: 51.2 }),
    ]
    render(<ShiftPathLayer map={mockMap as MockMap} pings={pings} />)
    const endpointsSource = mockMap._sources.get('shift-path-endpoints-source')
    const lastCall = endpointsSource?.setData.mock.calls.at(-1)?.[0] as GeoJSON.FeatureCollection
    expect(lastCall.features).toHaveLength(2)
    expect(lastCall.features[0]?.properties?.kind).toBe('start')
    expect(lastCall.features[1]?.properties?.kind).toBe('end')
  })

  it('cleanup removes layers and sources on unmount', () => {
    const { unmount } = render(<ShiftPathLayer map={mockMap as MockMap} pings={[makePing()]} />)
    unmount()
    expect(mockMap.removeLayer).toHaveBeenCalledWith('shift-path-line')
    expect(mockMap.removeLayer).toHaveBeenCalledWith('shift-path-points')
    expect(mockMap.removeSource).toHaveBeenCalledWith('shift-path-source')
    expect(mockMap.removeSource).toHaveBeenCalledWith('shift-path-endpoints-source')
  })

  it('updates data via setData on rerender (not re-add)', () => {
    const { rerender } = render(<ShiftPathLayer map={mockMap as MockMap} pings={[makePing()]} />)
    expect(mockMap.addSource).toHaveBeenCalledTimes(2)
    rerender(
      <ShiftPathLayer
        map={mockMap as MockMap}
        pings={[makePing({ longitude: 71.1 }), makePing({ longitude: 71.2 })]}
      />,
    )
    // init effect deps `[map, sourceId, lineLayerId, ...]` НЕ зависят от pings —
    // addSource вызвался только при mount'е.
    expect(mockMap.addSource).toHaveBeenCalledTimes(2)
    const lineSource = mockMap._sources.get('shift-path-source')
    expect(lineSource?.setData.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
