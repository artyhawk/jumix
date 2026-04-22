'use client'

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { DARK_RASTER_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from './map-style'

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once init; hot options читаются через refs
  useEffect(() => {
    if (!container.current) return
    if (mapRef.current) return

    const map = new maplibregl.Map({
      container: container.current,
      style: DARK_RASTER_STYLE,
      center: initialCenter ?? DEFAULT_CENTER,
      zoom: initialZoom,
      attributionControl: { compact: true },
      interactive,
    })

    map.on('load', () => {
      mapRef.current = map
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

  return <div ref={container} className={className} aria-label="Карта" />
}
