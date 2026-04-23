import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'

/**
 * Регистрация `pmtiles://` protocol handler в MapLibre (B3-UI-5b).
 * Вызывается один раз на client-side при загрузке любого map-components.
 * При повторных вызовах — idempotent (MapLibre игнорирует duplicate register).
 *
 * Protomaps `pmtiles://` scheme → MapLibre делает HTTP Range requests к
 * одному .pmtiles файлу вместо tile-server RPC. Self-hosting: nginx отдаёт
 * статический файл с `Accept-Ranges: bytes` (см. infra/nginx/nginx.conf).
 */
let registered = false

export function registerPmtilesProtocol(): void {
  if (registered) return
  if (typeof window === 'undefined') return
  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  registered = true
}
