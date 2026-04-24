/**
 * Geofence helpers (M5-b, ADR 0007 §3-4).
 *
 * Pure functions — без зависимостей от expo-location / SQLite, unit-testable
 * в jsdom. Вычисление идёт на клиенте ad-hoc при получении каждого location
 * update'а: distance ping → site center + tolerance = inside/outside.
 *
 * ### Tolerance
 *
 * `effectiveRadius = site.geofenceRadiusM + ping.accuracyMeters`. Если GPS
 * accuracy 20m и site radius 200m, ping считается inside вплоть до 220m.
 * Предотвращает false-exit на границе зоны из-за шумного fix'а.
 *
 * ### State transitions (consecutive-2 rule)
 *
 * Single ping outside может быть GPS noise (clouds, multipath). Меняем
 * state только при **N consecutive** pings в новом состоянии. Re-entry
 * тот же порог. Mixed => 'unknown' — не trigger'им banner/audit.
 */

export type GeofenceState = 'inside' | 'outside' | 'unknown'

export interface PingForGeofence {
  latitude: number
  longitude: number
  accuracyMeters: number | null
}

export interface SiteForGeofence {
  latitude: number
  longitude: number
  geofenceRadiusM: number
}

/** Haversine distance в метрах. Pure function, accuracy ±1m на ≤100km. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Проверка inside/outside с accuracy tolerance. accuracyMeters=null =>
 * no tolerance (strict geometric boundary).
 */
export function isInsideGeofence(ping: PingForGeofence, site: SiteForGeofence): boolean {
  const d = distanceMeters(ping.latitude, ping.longitude, site.latitude, site.longitude)
  const tolerance = ping.accuracyMeters ?? 0
  return d <= site.geofenceRadiusM + tolerance
}

/**
 * Агрегирует state от N последних pings. Consecutive-rule предотвращает
 * flicker на границе зоны.
 *
 * @param pings — последние pings (порядок не важен, функция смотрит на все).
 * @param consecutiveRequired — сколько последних pings должны совпадать в
 *   направлении. Default 2.
 *
 * @returns 'inside' если ВСЕ pings inside, 'outside' если ВСЕ outside,
 *   'unknown' при смешанном состоянии или если pings.length < required.
 */
export function computeGeofenceState(
  insideFlags: Array<boolean | null>,
  consecutiveRequired = 2,
): GeofenceState {
  if (insideFlags.length < consecutiveRequired) return 'unknown'
  const tail = insideFlags.slice(-consecutiveRequired)
  // null в хвосте = unknown для этого ping'а; state не triggers'ится.
  if (tail.some((v) => v === null)) return 'unknown'
  if (tail.every((v) => v === true)) return 'inside'
  if (tail.every((v) => v === false)) return 'outside'
  return 'unknown'
}
