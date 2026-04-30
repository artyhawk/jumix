'use client'

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { BaseMap } from './base-map'
import { circlePolygon } from './geofence-polygon'
import { useMapStyleEpoch } from './map-style'
import { RadiusSlider } from './radius-slider'

export interface MapPickerValue {
  latitude: number
  longitude: number
  radiusM: number
}

interface MapPickerProps {
  value: MapPickerValue | null
  onChange: (value: MapPickerValue | null) => void
  /** Диапазон slider'а по метрам (клампится бэкендом в 1..10000). */
  minRadius?: number
  maxRadius?: number
  defaultRadius?: number
}

/**
 * Click-to-place виджет: пользователь кликает на карту → marker ставится в
 * эту точку + круг геозоны (radius slider). "Сбросить" возвращает value в null.
 *
 * Используется в CreateSiteDialog step 2 и SiteDetailDrawer edit mode.
 */
export function MapPicker({
  value,
  onChange,
  minRadius = 50,
  maxRadius = 1000,
  defaultRadius = 200,
}: MapPickerProps) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const styleEpoch = useMapStyleEpoch(map)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const sourceId = 'picker-geofence'
  const fillId = 'picker-geofence-fill'
  const lineId = 'picker-geofence-line'

  const handleClick = (coords: [number, number]) => {
    onChange({
      longitude: coords[0],
      latitude: coords[1],
      radiusM: value?.radiusM ?? defaultRadius,
    })
  }

  const handleRadiusChange = (radiusM: number) => {
    if (!value) return
    onChange({ ...value, radiusM })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: styleEpoch — синтетический trigger для re-add layers после map.setStyle (B3-THEME-2)
  useEffect(() => {
    if (!map) return

    if (!value) {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      if (map.getLayer(fillId)) map.removeLayer(fillId)
      if (map.getLayer(lineId)) map.removeLayer(lineId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
      return
    }

    const geojson: GeoJSON.Feature = {
      type: 'Feature',
      geometry: circlePolygon({ lng: value.longitude, lat: value.latitude }, value.radiusM),
      properties: {},
    }

    const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
    if (existing) {
      existing.setData(geojson)
    } else {
      map.addSource(sourceId, { type: 'geojson', data: geojson })
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        paint: { 'fill-color': '#F97B10', 'fill-opacity': 0.1 },
      })
      map.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        paint: { 'line-color': '#F97B10', 'line-width': 1 },
      })
    }

    if (markerRef.current) {
      markerRef.current.setLngLat([value.longitude, value.latitude])
    } else {
      const el = document.createElement('div')
      el.className = 'size-3.5 rounded-full bg-brand-500 border-2 border-layer-0 shadow-lg'
      el.setAttribute('aria-hidden', 'true')
      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([value.longitude, value.latitude])
        .addTo(map)
    }
  }, [map, value, styleEpoch])

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[360px] rounded-[10px] overflow-hidden border border-border-default">
        <BaseMap
          initialCenter={value ? [value.longitude, value.latitude] : undefined}
          onReady={setMap}
          onClick={handleClick}
          className="absolute inset-0"
        />
        {!value ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <p className="rounded-full bg-layer-2/90 px-3 py-1.5 text-xs text-text-primary shadow-md border border-border-default">
              Кликните на карте, чтобы выбрать расположение
            </p>
          </div>
        ) : null}
      </div>

      {value ? (
        <>
          <div className="flex items-center justify-between text-xs text-text-tertiary">
            <span>
              Координаты:{' '}
              <span className="font-mono-numbers text-text-primary">
                {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-brand-500 hover:underline"
            >
              Сбросить
            </button>
          </div>
          <RadiusSlider
            value={value.radiusM}
            onChange={handleRadiusChange}
            min={minRadius}
            max={maxRadius}
          />
        </>
      ) : null}
    </div>
  )
}
