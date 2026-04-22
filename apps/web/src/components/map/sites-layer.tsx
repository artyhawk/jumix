'use client'

import type { Site } from '@/lib/api/types'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { circlePolygon } from './geofence-polygon'

export interface SitesLayerProps {
  map: MapLibreMap | null
  sites: Site[]
  activeSiteId?: string | null
  onSiteClick?: (site: Site) => void
}

const SOURCE_ID = 'sites-geofences'
const FILL_LAYER_ID = 'sites-geofences-fill'
const LINE_LAYER_ID = 'sites-geofences-line'

/**
 * Рендерит sites как маркеры + круги геозон. Цветовая палитра из
 * design-system §8.5: `#F97B10` (brand-500), fill 10%, stroke 1px.
 */
export function SitesLayer({ map, sites, activeSiteId, onSiteClick }: SitesLayerProps) {
  const markersRef = useRef<maplibregl.Marker[]>([])
  const onSiteClickRef = useRef(onSiteClick)
  onSiteClickRef.current = onSiteClick

  useEffect(() => {
    if (!map) return

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: sites.map((site) => ({
        type: 'Feature',
        geometry: circlePolygon({ lng: site.longitude, lat: site.latitude }, site.radiusM),
        properties: { id: site.id, name: site.name },
      })),
    }

    const existingSource = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (existingSource) {
      existingSource.setData(geojson)
    } else {
      map.addSource(SOURCE_ID, { type: 'geojson', data: geojson })
      map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': '#F97B10',
          'fill-opacity': 0.1,
        },
      })
      map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#F97B10',
          'line-width': 1,
        },
      })
    }

    // markers — пересоздаём целиком (дёшево для N<100)
    for (const m of markersRef.current) m.remove()
    const markers: maplibregl.Marker[] = []
    for (const site of sites) {
      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute('aria-label', `Объект ${site.name}`)
      el.className =
        'size-3 rounded-full bg-brand-500 border-2 border-layer-0 cursor-pointer transition-transform'
      if (site.id === activeSiteId) el.style.transform = 'scale(1.6)'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onSiteClickRef.current?.(site)
      })
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([site.longitude, site.latitude])
        .addTo(map)
      markers.push(marker)
    }
    markersRef.current = markers

    return () => {
      for (const m of markers) m.remove()
      markersRef.current = []
      // layers/source оставляем — следующий render переиспользует через setData
    }
  }, [map, sites, activeSiteId])

  return null
}
