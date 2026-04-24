import { isInsideGeofence } from '@/lib/tracking/geofence'
import { enqueuePing } from '@/lib/tracking/queue'
import { tryFlushQueue } from '@/lib/tracking/sync'
import * as Location from 'expo-location'
import { useEffect } from 'react'

/**
 * Foreground refinement tracking (M5-b, ADR 0007 §1).
 *
 * Пока shift screen mounted и shift active/paused — каждые 15 секунд
 * сэмплируем `getCurrentPositionAsync` с Accuracy.High (~10m) и
 * enqueue → flush. Параллельно TaskManager background task продолжает
 * работу на 60s interval; два источника просто merge'атся в SQLite
 * queue (no dedup — server partial-reject игнорирует near-duplicates
 * implicitly через CHECK constraints на coords).
 *
 * Off-screen (shift screen unmounted) → только background task. Это
 * экономит battery — foreground 15s High accuracy жрёт прилично.
 *
 * Hook bails-out если:
 *   - shift null или ended
 *   - site null (shift без site? impossible, но defensive)
 *   - permissions missing (caller проверяет через ensureTrackingPermissions
 *     до startTracking — к моменту hook'а уже granted)
 */

const FOREGROUND_INTERVAL_MS = 15_000

export interface TrackedShift {
  id: string
  status: 'active' | 'paused' | 'ended'
}

export interface TrackedSite {
  latitude: number
  longitude: number
  geofenceRadiusM: number
}

export function useForegroundTracking(shift: TrackedShift | null, site: TrackedSite | null): void {
  useEffect(() => {
    if (!shift || !site) return
    if (shift.status === 'ended') return

    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        })
        const accuracy = typeof loc.coords.accuracy === 'number' ? loc.coords.accuracy : null
        const inside = isInsideGeofence(
          {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracyMeters: accuracy,
          },
          site,
        )
        await enqueuePing(shift.id, {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracyMeters: accuracy,
          recordedAt: new Date(loc.timestamp).toISOString(),
          insideGeofence: inside,
        })
        await tryFlushQueue(shift.id)
      } catch {
        // GPS fix может fail (clouds, indoor). Skip tick, back to interval.
      }
    }

    // Immediate tick на mount — чтобы banner обновился без ждать 15s.
    void tick()
    const interval = setInterval(() => void tick(), FOREGROUND_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [shift, site])
}
