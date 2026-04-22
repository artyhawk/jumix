import type { StyleSpecification } from 'maplibre-gl'

/**
 * Тёмная raster-подложка для MVP. Использует публичные тайлы CARTO
 * (dark_all — OpenStreetMap + CARTO attribution, без API-key'а).
 * Production-путь: self-hosted pmtiles через MinIO + Protomaps vector theme
 * (backlog infrastructure.md).
 *
 * Дизайн-система §8.5: тёмный фон, границы приглушённые, дороги видны но
 * не доминируют. CARTO dark matter подходит под требование плюс-минус.
 */
export const DARK_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#0B0B0E' },
    },
    {
      id: 'carto-dark',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
  glyphs: undefined,
  sprite: undefined,
}

/** Астана как дефолтный центр Казахстана (lng, lat). */
export const DEFAULT_CENTER: [number, number] = [71.4491, 51.1694]
export const DEFAULT_ZOOM = 10
