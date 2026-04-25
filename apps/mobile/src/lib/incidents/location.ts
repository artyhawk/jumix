import { getRecentPings } from '@/lib/tracking/queue'

/**
 * GPS auto-attach helper для incident reports (M6, ADR 0008). Читает
 * latest ping из локальной SQLite queue (M5 tracking layer); если
 * recent (≤ STALE_THRESHOLD_MS) — возвращаем coords. Иначе null —
 * incident отправляется без geo (offline-tolerant).
 *
 * Operator может report incident:
 *   - Во время active shift → recent pings есть → GPS auto-attached
 *   - После end shift → нет recent pings → null (acceptable)
 *   - Без active shift → нет pings вообще → null
 *
 * Backlog: вместо queue читать `Location.getCurrentPositionAsync()` если
 * permission granted — чтобы зацепить geo даже off-shift. Минимально
 * useful для M6 — incidents reportят чаще всего во время смен.
 */

const STALE_THRESHOLD_MS = 5 * 60_000 // 5 минут

export interface RecentLocationCandidate {
  latitude: number
  longitude: number
  recordedAt: string
  ageMs: number
}

/**
 * Returns recent location for active shift, or null if нет pings или
 * stale (> 5 min).
 *
 * Если `shiftId` undefined (operator вне смены) → null.
 */
export async function getRecentLocationForIncident(
  shiftId: string | null | undefined,
  now: number = Date.now(),
): Promise<RecentLocationCandidate | null> {
  if (!shiftId) return null

  let pings: Awaited<ReturnType<typeof getRecentPings>>
  try {
    pings = await getRecentPings(shiftId, 1)
  } catch {
    // SQLite ошибки не должны blockировать incident submission.
    return null
  }
  const latest = pings[0]
  if (!latest) return null

  const recordedMs = new Date(latest.recordedAt).getTime()
  if (Number.isNaN(recordedMs)) return null
  const ageMs = now - recordedMs
  if (ageMs > STALE_THRESHOLD_MS) return null
  if (ageMs < 0) return null // future timestamp — clock skew, skip

  return {
    latitude: latest.latitude,
    longitude: latest.longitude,
    recordedAt: latest.recordedAt,
    ageMs,
  }
}
