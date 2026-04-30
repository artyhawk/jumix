'use client'

import { useTheme } from '@/lib/theme/theme-provider'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { DEFAULT_CENTER, DEFAULT_ZOOM, getMapStyleFor } from './map-style'
import { registerPmtilesProtocol } from './register-pmtiles'

// Регистрируем `pmtiles://` handler на client module load — до первого
// Map instance. Idempotent: повторные вызовы безопасны (см. register-pmtiles.ts).
registerPmtilesProtocol()

export interface BaseMapProps {
  /** Начальный центр `[lng, lat]`. Astana по умолчанию. */
  initialCenter?: [number, number]
  initialZoom?: number
  /** Вызывается один раз когда map `load` event сработал, map готов к layer'ам. */
  onReady?: (map: MapLibreMap) => void
  /** Вызывается на каждый click по карте с координатами `[lng, lat]`. */
  onClick?: (coords: [number, number]) => void
  /** Дополнительные CSS-классы для контейнера. */
  className?: string
  /** Отключить элементы управления (zoom buttons) — например в мини-превью. */
  interactive?: boolean
}

/**
 * Reusable MapLibre wrapper. Инициализирует карту один раз при mount'е,
 * подписывается на `load` → `onReady`, на `click` → `onClick`. Cleanup через
 * `map.remove()` при unmount'е.
 *
 * B3-THEME-2: подписан на `useTheme()`. На смене resolved theme вызывает
 * `map.setStyle(...)` — MapLibre заменяет style atomically. Overlay-layers
 * (SitesLayer, ShiftPathLayer, ...) сбрасываются и должны быть re-added; для
 * этого используется `useMapStyleEpoch(map)` (инкремент counter'а на каждый
 * `style.load`) — слой добавляет epoch в свои useEffect deps.
 *
 * WebGL недоступен в jsdom, поэтому для тестов используем `vi.mock('maplibre-gl')` —
 * юнит-тесты проверяют только монтирование контейнера и propagation кликов.
 * Полная интеграция — ручная в dev.
 */
export function BaseMap({
  initialCenter,
  initialZoom = DEFAULT_ZOOM,
  onReady,
  onClick,
  className,
  interactive = true,
}: BaseMapProps) {
  const container = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onReadyRef = useRef(onReady)
  const onClickRef = useRef(onClick)
  onReadyRef.current = onReady
  onClickRef.current = onClick
  const { theme } = useTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once init; hot options читаются через refs
  useEffect(() => {
    if (!container.current) return
    if (mapRef.current) return

    const map = new maplibregl.Map({
      container: container.current,
      style: getMapStyleFor(themeRef.current),
      center: initialCenter ?? DEFAULT_CENTER,
      zoom: initialZoom,
      attributionControl: { compact: true },
      interactive,
    })
    // Synchronous ref set — theme-watch effect ниже может race'иться с
    // map.on('load') если пользователь переключил тему ДО первого style.load
    // (typical: ThemeProvider hydrates быстрее чем WebGL initialize). С ref
    // выставленным сразу, setStyle на следующем render'е применится корректно.
    mapRef.current = map

    map.on('load', () => {
      onReadyRef.current?.(map)
    })

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      onClickRef.current?.([e.lngLat.lng, e.lngLat.lat])
    }
    map.on('click', handleClick)

    return () => {
      map.off('click', handleClick)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Theme-aware style swap. Срабатывает только когда map уже инициализирован.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(getMapStyleFor(theme))
  }, [theme])

  return <div ref={container} className={className} aria-label="Карта" />
}
