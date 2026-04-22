import { describe, expect, it } from 'vitest'
import { DARK_VECTOR_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from './map-style'

/**
 * MapLibre 5.x падает на load'е если style содержит layer'ы с text-field, но
 * глобальный `glyphs` не задан (`glyphs: string expected, undefined found`).
 * protomaps-themes-base даёт layer'ы с text-labels — следим, чтобы glyphs
 * URL всегда присутствовал в style config'е.
 */
describe('DARK_VECTOR_STYLE', () => {
  it('defines glyphs URL (MapLibre Style Spec required для text-labels)', () => {
    expect(typeof DARK_VECTOR_STYLE.glyphs).toBe('string')
    expect(DARK_VECTOR_STYLE.glyphs).toMatch(/\{fontstack\}.*\{range\}/)
  })

  it('has protomaps vector source with tile URL', () => {
    const source = DARK_VECTOR_STYLE.sources.protomaps
    expect(source).toBeDefined()
    expect(source?.type).toBe('vector')
  })

  it('has non-empty layers from protomaps-themes-base', () => {
    expect(Array.isArray(DARK_VECTOR_STYLE.layers)).toBe(true)
    expect(DARK_VECTOR_STYLE.layers.length).toBeGreaterThan(10)
  })
})

describe('map defaults', () => {
  it('DEFAULT_CENTER points to Астана (lng≈71.45, lat≈51.17)', () => {
    expect(DEFAULT_CENTER[0]).toBeCloseTo(71.45, 1)
    expect(DEFAULT_CENTER[1]).toBeCloseTo(51.17, 1)
  })

  it('DEFAULT_ZOOM set', () => {
    expect(typeof DEFAULT_ZOOM).toBe('number')
    expect(DEFAULT_ZOOM).toBeGreaterThan(0)
  })
})
