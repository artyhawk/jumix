import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

/**
 * Тёмная vector-подложка через `@protomaps/basemaps` (dark flavor).
 * Глифы и слои (water/roads/buildings/labels) идут из npm пакета, что
 * гарантирует MapLibre Style Spec compliance (наш предыдущий inline style
 * падал с `glyphs: string expected, undefined found` на maplibre-gl 5.x).
 *
 * Tile source — публичный demo-endpoint Protomaps, в production заменим на
 * self-hosted pmtiles (см. backlog "Production tile infrastructure").
 */
const PROTOMAPS_TILE_URL = 'https://api.protomaps.com/tiles/v3/{z}/{x}/{y}.mvt'
const GLYPHS_URL = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf'
const SPRITE_URL = 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark'

export const DARK_VECTOR_STYLE: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS_URL,
  sprite: SPRITE_URL,
  sources: {
    protomaps: {
      type: 'vector',
      tiles: [PROTOMAPS_TILE_URL],
      maxzoom: 15,
      attribution:
        '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    },
  },
  layers: layers('protomaps', namedFlavor('dark'), { lang: 'ru' }),
}

/** Астана как дефолтный центр Казахстана (lng, lat). */
export const DEFAULT_CENTER: [number, number] = [71.4491, 51.1694]
export const DEFAULT_ZOOM = 10
