'use client'

import type { Crane, Site } from '@/lib/api/types'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef } from 'react'

export interface CranesLayerProps {
  map: MapLibreMap | null
  cranes: Crane[]
  sites: Site[]
  onCraneClick?: (crane: Crane) => void
}

/**
 * Рендерит cranes сгруппированными по siteId — один маркер на site, с
 * count-badge'ем при N>1. Cranes без siteId («на складе») не отображаются.
 * Маркер — квадрат, чтобы визуально не путаться с круглыми site-маркерами.
 */
export function CranesLayer({ map, cranes, sites, onCraneClick }: CranesLayerProps) {
  const markersRef = useRef<maplibregl.Marker[]>([])
  const onCraneClickRef = useRef(onCraneClick)
  onCraneClickRef.current = onCraneClick

  useEffect(() => {
    if (!map) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const sitesById = new Map(sites.map((s) => [s.id, s]))
    const grouped = new Map<string, Crane[]>()
    for (const c of cranes) {
      if (!c.siteId) continue
      if (!sitesById.has(c.siteId)) continue
      const list = grouped.get(c.siteId) ?? []
      list.push(c)
      grouped.set(c.siteId, list)
    }

    const markers: maplibregl.Marker[] = []
    for (const [siteId, list] of grouped) {
      const site = sitesById.get(siteId)
      if (!site) continue
      const first = list[0]
      if (!first) continue
      const wrap = document.createElement('button')
      wrap.type = 'button'
      const label = list.length === 1 ? first.model : `${list.length} кранов`
      wrap.setAttribute('aria-label', `Кран на объекте ${site.name}: ${label}`)
      wrap.className =
        'relative inline-flex size-4 items-center justify-center rounded-[3px] bg-brand-400 border-2 border-layer-0 cursor-pointer transition-transform hover:scale-110'
      // anchor на правый-верх site-маркера, чтобы не перекрывать его
      wrap.style.transform = 'translate(8px, -8px)'

      if (list.length > 1) {
        const badge = document.createElement('span')
        badge.className =
          'absolute -top-2 -right-2 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-text-primary px-1 text-[10px] font-semibold text-layer-0'
        badge.textContent = String(list.length)
        wrap.appendChild(badge)
      }

      wrap.addEventListener('click', (e) => {
        e.stopPropagation()
        // single → open this crane; group → open first (на MVP без выбора)
        onCraneClickRef.current?.(first)
      })

      const marker = new maplibregl.Marker({ element: wrap })
        .setLngLat([site.longitude, site.latitude])
        .addTo(map)
      markers.push(marker)
    }
    markersRef.current = markers

    return () => {
      for (const m of markers) m.remove()
      markersRef.current = []
    }
  }, [map, cranes, sites])

  return null
}
