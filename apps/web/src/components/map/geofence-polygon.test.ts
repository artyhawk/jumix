import { describe, expect, it } from 'vitest'
import { circlePolygon } from './geofence-polygon'

const ASTANA = { lng: 71.449074, lat: 51.169392 }

function distanceM(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6_371_000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

describe('circlePolygon', () => {
  it('returns Polygon geometry with default 64 steps (+ 1 closing vertex)', () => {
    const poly = circlePolygon(ASTANA, 200)
    expect(poly.type).toBe('Polygon')
    expect(poly.coordinates).toHaveLength(1)
    expect(poly.coordinates[0]).toHaveLength(65)
  })

  it('first and last vertex are identical (closed ring)', () => {
    const poly = circlePolygon(ASTANA, 200)
    const ring = poly.coordinates[0]!
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it('all sample points sit within ±0.5% of requested radius', () => {
    const radius = 500
    const poly = circlePolygon(ASTANA, radius)
    const ring = poly.coordinates[0]!
    for (const [lng, lat] of ring) {
      const d = distanceM(ASTANA, { lng: lng!, lat: lat! })
      expect(Math.abs(d - radius) / radius).toBeLessThan(0.005)
    }
  })

  it('respects custom step count', () => {
    const poly = circlePolygon(ASTANA, 100, 8)
    expect(poly.coordinates[0]).toHaveLength(9)
  })

  it('throws on non-positive radius', () => {
    expect(() => circlePolygon(ASTANA, 0)).toThrow()
    expect(() => circlePolygon(ASTANA, -5)).toThrow()
  })
})
