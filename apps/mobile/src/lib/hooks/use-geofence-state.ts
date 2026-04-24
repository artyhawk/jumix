import { type GeofenceState, computeGeofenceState } from '@/lib/tracking/geofence'
import { type QueuedPing, getRecentPings } from '@/lib/tracking/queue'
import { useEffect, useState } from 'react'

/**
 * Geofence state hook (M5-b, ADR 0007 §3-4).
 *
 * Polls local SQLite queue каждые 5 секунд, berет последние N pings
 * (порядок по recordedAt DESC → reverse для chronological), применяет
 * `computeGeofenceState` с consecutive-2 rule.
 *
 * Возвращает `{state, lastPingAgeMs}` — `state` для badge/banner,
 * `lastPingAgeMs` для stale-GPS indicator.
 *
 * Почему local SQLite (а не сервер): advisory UX должен работать offline.
 * Если network down — banner всё равно показывается через local pings.
 */

const POLL_INTERVAL_MS = 5_000
const CONSECUTIVE_REQUIRED = 2
const WINDOW_SIZE = 3

export interface GeofenceStateResult {
  state: GeofenceState
  lastPingAgeMs: number | null
  pendingCount: number
}

export function useGeofenceState(shiftId: string | null): GeofenceStateResult {
  const [result, setResult] = useState<GeofenceStateResult>({
    state: 'unknown',
    lastPingAgeMs: null,
    pendingCount: 0,
  })

  useEffect(() => {
    if (!shiftId) {
      setResult({ state: 'unknown', lastPingAgeMs: null, pendingCount: 0 })
      return
    }

    let cancelled = false

    const check = async () => {
      try {
        const recent = await getRecentPings(shiftId, WINDOW_SIZE)
        if (cancelled) return
        // getRecentPings DESC → reverse чтобы в хронологическом порядке
        // (computeGeofenceState берёт tail = последние).
        const chronological = [...recent].reverse()
        const state = computeGeofenceState(
          chronological.map((p) => p.insideGeofence),
          CONSECUTIVE_REQUIRED,
        )
        const latest = recent[0] ?? null
        const lastPingAgeMs = latest ? Date.now() - Date.parse(latest.recordedAt) : null
        setResult({
          state,
          lastPingAgeMs,
          pendingCount: countPendingInBatch(recent),
        })
      } catch {
        // SQLite query failed — оставляем previous state, не спамим UI.
      }
    }

    void check()
    const interval = setInterval(() => void check(), POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [shiftId])

  return result
}

function countPendingInBatch(pings: QueuedPing[]): number {
  return pings.filter((p) => p.syncedAt === null).length
}
