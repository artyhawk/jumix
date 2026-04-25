'use client'

import type { ActiveShiftLocation } from '@/lib/api/types'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef } from 'react'

export interface LiveCranesLayerProps {
  map: MapLibreMap | null
  locations: ActiveShiftLocation[]
  onLocationClick?: (location: ActiveShiftLocation) => void
}

/**
 * Рендерит последние известные позиции кранов по активным сменам (M5-c).
 * Цвет маркера — semantic tone по состоянию пинга:
 *   - stale (minutesSinceLastPing > 10)  → warning (жёлтый)
 *   - outside geofence                   → danger (красный)
 *   - inside + свежий                    → success (зелёный)
 *   - unknown geofence + свежий          → neutral (серый)
 *
 * Круглая форма — чтобы визуально отличить от квадратных static-crane
 * маркеров (CranesLayer) и от site-point'ов (те меньше и обведены в border).
 */

export const STALE_THRESHOLD_MINUTES = 10

export type LiveCraneTone = 'success' | 'danger' | 'warning' | 'neutral'

export function getLiveCraneTone(location: ActiveShiftLocation): LiveCraneTone {
  if (location.minutesSinceLastPing > STALE_THRESHOLD_MINUTES) return 'warning'
  if (location.insideGeofence === false) return 'danger'
  if (location.insideGeofence === true) return 'success'
  return 'neutral'
}

const TONE_CLASSES: Record<LiveCraneTone, string> = {
  success: 'bg-success border-success',
  danger: 'bg-danger border-danger',
  warning: 'bg-warning border-warning',
  neutral: 'bg-text-tertiary border-text-tertiary',
}

export function LiveCranesLayer({ map, locations, onLocationClick }: LiveCranesLayerProps) {
  const markersRef = useRef<maplibregl.Marker[]>([])
  const onLocationClickRef = useRef(onLocationClick)
  onLocationClickRef.current = onLocationClick

  useEffect(() => {
    if (!map) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const markers: maplibregl.Marker[] = []
    for (const loc of locations) {
      const tone = getLiveCraneTone(loc)
      const operatorName = [loc.operator.lastName, loc.operator.firstName].filter(Boolean).join(' ')
      const wrap = document.createElement('button')
      wrap.type = 'button'
      wrap.setAttribute(
        'aria-label',
        `Кран ${loc.crane.model} — ${operatorName} (${loc.minutesSinceLastPing} мин назад)`,
      )
      wrap.dataset.tone = tone
      wrap.className = `relative inline-flex size-5 items-center justify-center rounded-full border-2 cursor-pointer transition-transform hover:scale-110 shadow-[0_0_0_2px_rgba(0,0,0,0.6)] ${TONE_CLASSES[tone]}`

      // Small inner dot для глубины — виден на тёмной карте
      const inner = document.createElement('span')
      inner.className = 'size-1.5 rounded-full bg-layer-0/70'
      wrap.appendChild(inner)

      wrap.addEventListener('click', (e) => {
        e.stopPropagation()
        onLocationClickRef.current?.(loc)
      })

      const marker = new maplibregl.Marker({ element: wrap })
        .setLngLat([loc.longitude, loc.latitude])
        .addTo(map)
      markers.push(marker)
    }
    markersRef.current = markers

    return () => {
      for (const m of markers) m.remove()
      markersRef.current = []
    }
  }, [map, locations])

  return null
}
