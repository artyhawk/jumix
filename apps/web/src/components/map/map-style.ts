import { env } from '@/config/env'
import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

/**
 * Vector basemaps через `@protomaps/basemaps` (dark + light flavor).
 * Глифы и слои (water/roads/buildings/labels) идут из npm пакета, что
 * гарантирует MapLibre Style Spec compliance (наш предыдущий inline style
 * падал с `glyphs: string expected, undefined found` на maplibre-gl 5.x).
 *
 * B3-THEME-2: dual style — `getMapStyleFor(theme)` возвращает соответствующий.
 * BaseMap слушает theme change → `map.setStyle(...)` → re-add overlay layers
 * (style replacement clears non-base layers).
 *
 * Tile source (B3-UI-5b) — env-gated:
 *  - `NEXT_PUBLIC_TILES_URL` = URL к self-hosted .pmtiles файлу (prod) —
 *    запрашивается через `pmtiles://` protocol (см. `register-pmtiles.ts`);
 *    MapLibre шлёт HTTP Range requests к одному файлу вместо tile-server
 *    RPC — дешевле и быстрее для небольшого purpose-built региона (Казахстан
 *    crop ~500MB vs. full planet 90GB).
 *  - Пусто → fallback на публичный demo-endpoint Protomaps (dev / ручной тест).
 */
const PROTOMAPS_DEMO_TILE_URL = 'https://api.protomaps.com/tiles/v3/{z}/{x}/{y}.mvt'
const GLYPHS_URL = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf'
const SPRITE_DARK_URL = 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark'
const SPRITE_LIGHT_URL = 'https://protomaps.github.io/basemaps-assets/sprites/v4/light'

function resolveTileSource(): StyleSpecification['sources'] {
  const selfHosted = env.NEXT_PUBLIC_TILES_URL
  if (selfHosted) {
    return {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${selfHosted}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    }
  }
  return {
    protomaps: {
      type: 'vector',
      tiles: [PROTOMAPS_DEMO_TILE_URL],
      maxzoom: 15,
      attribution:
        '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    },
  }
}

function buildStyle(flavor: 'dark' | 'light'): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sprite: flavor === 'dark' ? SPRITE_DARK_URL : SPRITE_LIGHT_URL,
    sources: resolveTileSource(),
    layers: layers('protomaps', namedFlavor(flavor), { lang: 'ru' }),
  }
}

export const DARK_VECTOR_STYLE: StyleSpecification = buildStyle('dark')
export const LIGHT_VECTOR_STYLE: StyleSpecification = buildStyle('light')

/** Возвращает стиль для текущей резолвенной темы. */
export function getMapStyleFor(theme: 'light' | 'dark'): StyleSpecification {
  return theme === 'dark' ? DARK_VECTOR_STYLE : LIGHT_VECTOR_STYLE
}

/** Астана как дефолтный центр Казахстана (lng, lat). */
export const DEFAULT_CENTER: [number, number] = [71.4491, 51.1694]
export const DEFAULT_ZOOM = 10

/**
 * Hook возвращает счётчик, инкрементируемый на каждый `style.load` MapLibre map'а.
 * После `map.setStyle(...)` все sources/layers сбрасываются — layer-компоненты
 * добавляют этот counter в deps своего useEffect и заново регистрируют свои
 * source+layer (existing-check вернёт undefined, переходим в create-branch).
 *
 * Использование: parent делает `useMapStyleEpoch(map)` и пропсит epoch в каждый
 * layer вместе с `map` чтобы layer'у достаточно было `[map, epoch, ...data]`
 * deps. Initial mount выдаёт epoch=0 и тоже триггерит add-layer (из-за first run).
 */
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useState } from 'react'

export function useMapStyleEpoch(map: MapLibreMap | null): number {
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    if (!map) return
    const onStyleLoad = () => setEpoch((n) => n + 1)
    map.on('style.load', onStyleLoad)
    return () => {
      map.off('style.load', onStyleLoad)
    }
  }, [map])
  return epoch
}
