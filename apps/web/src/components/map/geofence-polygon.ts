/**
 * Генерация GeoJSON-полигона (аппроксимация круга) для рендера геозоны на
 * MapLibre. MapLibre не умеет рендерить geodetic circles напрямую, поэтому
 * приходится сэмплировать N точек по окружности и отдавать их как полигон.
 *
 * Используем сферическую модель Земли (R = 6 371 000 м) — погрешность ±0.3%
 * в Казахстане достаточна для геозон радиусом ≤10 км. Turf.js добавил бы
 * ~30KB gzipped ради одной функции.
 */
const EARTH_RADIUS_M = 6_371_000
const DEFAULT_STEPS = 64

export interface LngLat {
  lng: number
  lat: number
}

/**
 * Возвращает координаты точки, удалённой от `origin` на `distanceM` метров
 * в направлении `bearingRad` (0 = север, π/2 = восток).
 */
function destination(origin: LngLat, bearingRad: number, distanceM: number): LngLat {
  const angular = distanceM / EARTH_RADIUS_M
  const lat1 = toRad(origin.lat)
  const lng1 = toRad(origin.lng)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearingRad),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    )
  return { lat: toDeg(lat2), lng: normalizeLng(toDeg(lng2)) }
}

/**
 * Строит GeoJSON Polygon (один замкнутый контур). Первая и последняя вершина
 * дублируются — того требует GeoJSON spec.
 */
export function circlePolygon(
  center: LngLat,
  radiusM: number,
  steps: number = DEFAULT_STEPS,
): GeoJSON.Polygon {
  if (radiusM <= 0) {
    throw new Error('radiusM must be > 0')
  }
  const coordinates: [number, number][] = []
  for (let i = 0; i < steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI
    const point = destination(center, bearing, radiusM)
    coordinates.push([point.lng, point.lat])
  }
  // замкнуть контур
  const first = coordinates[0]
  if (first) coordinates.push([first[0], first[1]])
  return { type: 'Polygon', coordinates: [coordinates] }
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

/**
 * Нормализует долготу в диапазон [-180, 180]. Пригодится если круг пересёк
 * линию перемены даты (Казахстана это не касается, но helper general).
 */
function normalizeLng(lng: number): number {
  let result = lng
  while (result > 180) result -= 360
  while (result < -180) result += 360
  return result
}
