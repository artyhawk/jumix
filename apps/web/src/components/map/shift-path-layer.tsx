'use client'

import type { LocationPing } from '@/lib/api/types'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect } from 'react'

export interface ShiftPathLayerProps {
  map: MapLibreMap | null
  pings: LocationPing[]
  /** Unique id — в одном map instance может быть > 1 path (unlikely, но корректно). */
  id?: string
}

const DEFAULT_ID = 'shift-path'

/**
 * Полилиния маршрута смены поверх карты (M5-c). `pings` упорядочены ASC по
 * `recordedAt` — тянем LineString через них. Когда pings < 2 — источник
 * пустой (линию рисовать нечего), но layers создаются — чтобы при появлении
 * пингов не переинициализировать.
 *
 * Цвет линии — brand-500 (#F97B10), 3px. Start-точка — success (зелёный),
 * end-точка — brand (оранжевый). Путь — главный фокус внимания в drawer'е.
 *
 * Pattern setData (не remove+add на каждый render) — реcucle подход из
 * SitesLayer: init один раз, data updates через setData. Cleanup только при
 * unmount или смене map.
 */
export function ShiftPathLayer({ map, pings, id = DEFAULT_ID }: ShiftPathLayerProps) {
  const sourceId = `${id}-source`
  const lineLayerId = `${id}-line`
  const pointsSourceId = `${id}-endpoints-source`
  const pointsLayerId = `${id}-points`

  // Init layers + cleanup на unmount / смене map / смене id
  useEffect(() => {
    if (!map) return

    const emptyFC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: emptyFC })
      map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#F97B10',
          'line-width': 3,
          'line-opacity': 0.85,
        },
      })
    }
    if (!map.getSource(pointsSourceId)) {
      map.addSource(pointsSourceId, { type: 'geojson', data: emptyFC })
      map.addLayer({
        id: pointsLayerId,
        type: 'circle',
        source: pointsSourceId,
        paint: {
          'circle-radius': 5,
          'circle-color': [
            'match',
            ['get', 'kind'],
            'start',
            '#10B981',
            'end',
            '#F97B10',
            '#9CA3AF',
          ],
          'circle-stroke-color': '#0A0A0A',
          'circle-stroke-width': 2,
        },
      })
    }

    return () => {
      if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId)
      if (map.getLayer(pointsLayerId)) map.removeLayer(pointsLayerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
      if (map.getSource(pointsSourceId)) map.removeSource(pointsSourceId)
    }
  }, [map, sourceId, lineLayerId, pointsSourceId, pointsLayerId])

  // Update data на каждое изменение pings
  useEffect(() => {
    if (!map) return
    const coords = pings.map((p) => [p.longitude, p.latitude] as [number, number])
    const hasLine = coords.length >= 2
    const lineData: GeoJSON.Feature<GeoJSON.LineString> | GeoJSON.FeatureCollection = hasLine
      ? {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {},
        }
      : { type: 'FeatureCollection', features: [] }

    const pointsData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        ...(coords.length > 0 && coords[0]
          ? [
              {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: coords[0] },
                properties: { kind: 'start' },
              },
            ]
          : []),
        ...(coords.length > 1 && coords[coords.length - 1]
          ? [
              {
                type: 'Feature' as const,
                geometry: {
                  type: 'Point' as const,
                  // biome-ignore lint/style/noNonNullAssertion: checked via length > 1
                  coordinates: coords[coords.length - 1]!,
                },
                properties: { kind: 'end' },
              },
            ]
          : []),
      ],
    }

    const lineSource = map.getSource(sourceId) as GeoJSONSource | undefined
    if (lineSource) lineSource.setData(lineData)
    const pointsSource = map.getSource(pointsSourceId) as GeoJSONSource | undefined
    if (pointsSource) pointsSource.setData(pointsData)
  }, [map, pings, sourceId, pointsSourceId])

  return null
}
