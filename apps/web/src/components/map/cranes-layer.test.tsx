import type { Crane, Site } from '@/lib/api/types'
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

import { CranesLayer } from './cranes-layer'

function makeSite(id: string, overrides: Partial<Site> = {}): Site {
  return {
    id,
    organizationId: 'o-1',
    name: `site-${id}`,
    address: null,
    latitude: 51.1,
    longitude: 71.1,
    radiusM: 200,
    status: 'active',
    notes: null,
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
    ...overrides,
  }
}

function makeCrane(id: string, siteId: string | null): Crane {
  return {
    id,
    organizationId: 'o-1',
    siteId,
    type: 'tower',
    model: `model-${id}`,
    inventoryNumber: null,
    capacityTon: 8,
    boomLengthM: null,
    yearManufactured: null,
    status: 'active',
    approvalStatus: 'approved',
    rejectionReason: null,
    notes: null,
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
  }
}

const fakeMap = {} as unknown as Parameters<typeof CranesLayer>[0]['map']

beforeEach(() => {
  markerCtor.mockClear()
  setLngLat.mockClear()
  addTo.mockClear()
  remove.mockClear()
})

describe('CranesLayer', () => {
  it('skips cranes with no siteId', () => {
    const sites = [makeSite('s-1')]
    const cranes = [makeCrane('c-1', null)]
    render(<CranesLayer map={fakeMap} sites={sites} cranes={cranes} />)
    expect(markerCtor).not.toHaveBeenCalled()
  })

  it('skips cranes pointing to unknown site', () => {
    const sites = [makeSite('s-1')]
    const cranes = [makeCrane('c-1', 's-missing')]
    render(<CranesLayer map={fakeMap} sites={sites} cranes={cranes} />)
    expect(markerCtor).not.toHaveBeenCalled()
  })

  it('renders one marker per site with cranes', () => {
    const sites = [makeSite('s-1'), makeSite('s-2')]
    const cranes = [makeCrane('c-1', 's-1'), makeCrane('c-2', 's-1'), makeCrane('c-3', 's-2')]
    render(<CranesLayer map={fakeMap} sites={sites} cranes={cranes} />)
    expect(markerCtor).toHaveBeenCalledTimes(2)
  })

  it('renders count-badge when >1 crane on site', () => {
    const sites = [makeSite('s-1')]
    const cranes = [makeCrane('c-1', 's-1'), makeCrane('c-2', 's-1'), makeCrane('c-3', 's-1')]
    render(<CranesLayer map={fakeMap} sites={sites} cranes={cranes} />)
    const element = markerCtor.mock.calls[0]?.[0]?.element as HTMLElement | undefined
    expect(element?.querySelector('span')?.textContent).toBe('3')
  })

  it('does not render count-badge when only 1 crane', () => {
    const sites = [makeSite('s-1')]
    const cranes = [makeCrane('c-1', 's-1')]
    render(<CranesLayer map={fakeMap} sites={sites} cranes={cranes} />)
    const element = markerCtor.mock.calls[0]?.[0]?.element as HTMLElement | undefined
    expect(element?.querySelector('span')).toBeNull()
  })

  it('click triggers onCraneClick with first crane of group', () => {
    const onCraneClick = vi.fn()
    const sites = [makeSite('s-1')]
    const cranes = [makeCrane('c-1', 's-1'), makeCrane('c-2', 's-1')]
    render(<CranesLayer map={fakeMap} sites={sites} cranes={cranes} onCraneClick={onCraneClick} />)
    const element = markerCtor.mock.calls[0]?.[0]?.element as HTMLElement | undefined
    element?.click()
    expect(onCraneClick).toHaveBeenCalledTimes(1)
    expect(onCraneClick.mock.calls[0]?.[0]?.id).toBe('c-1')
  })

  it('returns null when map is null', () => {
    render(<CranesLayer map={null} sites={[]} cranes={[]} />)
    expect(markerCtor).not.toHaveBeenCalled()
  })
})
