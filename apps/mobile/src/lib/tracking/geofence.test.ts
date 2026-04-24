import { describe, expect, it } from 'vitest'
import { computeGeofenceState, distanceMeters, isInsideGeofence } from './geofence'

/**
 * Unit-тесты geofence helpers (M5-b, ADR 0007 §3-4). Pure functions,
 * никаких native deps — работают в jsdom.
 */

describe('distanceMeters (Haversine)', () => {
  it('returns 0 для identical coords', () => {
    expect(distanceMeters(51.128, 71.43, 51.128, 71.43)).toBe(0)
  })

  it('~111km для 1° latitude (baseline calibration)', () => {
    const d = distanceMeters(51, 71.43, 52, 71.43)
    expect(d).toBeGreaterThan(110_000)
    expect(d).toBeLessThan(112_000)
  })

  it('симметрична (A→B == B→A)', () => {
    const a = distanceMeters(51.128, 71.43, 51.5, 72.0)
    const b = distanceMeters(51.5, 72.0, 51.128, 71.43)
    expect(a).toBeCloseTo(b, 5)
  })

  it('небольшой delta → small distance (~10m для 0.0001° ~ Астана)', () => {
    const d = distanceMeters(51.128, 71.43, 51.1281, 71.43)
    // ~11m для 0.0001° на широте Астаны
    expect(d).toBeGreaterThan(10)
    expect(d).toBeLessThan(13)
  })
})

describe('isInsideGeofence', () => {
  const site = { latitude: 51.128, longitude: 71.43, geofenceRadiusM: 200 }

  it('ping в центре → inside', () => {
    expect(isInsideGeofence({ latitude: 51.128, longitude: 71.43, accuracyMeters: 5 }, site)).toBe(
      true,
    )
  })

  it('ping за 500m → outside даже с accuracy 10', () => {
    // 0.005° latitude ~ 555m — далеко за radius 200m
    expect(isInsideGeofence({ latitude: 51.133, longitude: 71.43, accuracyMeters: 10 }, site)).toBe(
      false,
    )
  })

  it('accuracy tolerance расширяет boundary (210m distance, accuracy 20 → inside через 220m радиус)', () => {
    // Вычисляем точку на 210m от site
    // 1° lat ≈ 111km → 210m ≈ 0.00189°
    const ping = { latitude: 51.128 + 0.00189, longitude: 71.43, accuracyMeters: 20 }
    // distance ≈ 210m, effective radius = 200 + 20 = 220m → inside
    expect(isInsideGeofence(ping, site)).toBe(true)
  })

  it('accuracy null → no tolerance (strict boundary)', () => {
    const ping = { latitude: 51.128 + 0.0019, longitude: 71.43, accuracyMeters: null }
    // ~211m > 200m radius, no tolerance → outside
    expect(isInsideGeofence(ping, site)).toBe(false)
  })
})

describe('computeGeofenceState (consecutive-2 rule)', () => {
  it('empty → unknown', () => {
    expect(computeGeofenceState([], 2)).toBe('unknown')
  })

  it('single ping → unknown (<required)', () => {
    expect(computeGeofenceState([true], 2)).toBe('unknown')
  })

  it('2 inside → inside', () => {
    expect(computeGeofenceState([true, true], 2)).toBe('inside')
  })

  it('2 outside → outside', () => {
    expect(computeGeofenceState([false, false], 2)).toBe('outside')
  })

  it('mixed tail → unknown (фильтрует noise)', () => {
    expect(computeGeofenceState([true, false], 2)).toBe('unknown')
  })

  it('берёт последние 2 — [true, true, false, false] → outside', () => {
    expect(computeGeofenceState([true, true, false, false], 2)).toBe('outside')
  })

  it('null в хвосте → unknown (игнор unknown pings)', () => {
    expect(computeGeofenceState([true, null], 2)).toBe('unknown')
  })

  it('higher threshold: consecutive-3 filters one-off [true, true, false, true, true] → unknown на последних 3', () => {
    // Последние 3: [false, true, true] — mixed → unknown
    expect(computeGeofenceState([true, true, false, true, true], 3)).toBe('unknown')
  })

  it('higher threshold: consecutive-3 all true — inside', () => {
    expect(computeGeofenceState([true, true, true, true], 3)).toBe('inside')
  })
})
