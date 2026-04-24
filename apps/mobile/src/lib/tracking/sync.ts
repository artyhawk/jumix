import { ApiError, NetworkError } from '@/lib/api/errors'
import { ingestPings } from '@/lib/api/shifts'
import NetInfo from '@react-native-community/netinfo'
import { type QueuedPing, getPendingPings, incrementAttempts, markSynced } from './queue'

/**
 * Flush layer (M5-b, ADR 0007 §2).
 *
 * Берёт batch pending pings из SQLite queue → POST к backend → marks
 * accepted as synced. Invariant: server-side partial-reject возвращает
 * `{accepted, rejected}`. Accepted N — первые N pings (по ASC recordedAt
 * order) успешно инсертились; `rejected[i]` — invalid (future/stale),
 * их тоже помечаем synced локально (нет смысла retry'ить → вечный loop).
 *
 * Network errors (offline / 5xx): incrementAttempts + leave in queue.
 * Next flush attempt retry'ит.
 */

const BATCH_SIZE = 50

let flushInFlight: Promise<void> | null = null

export interface FlushResult {
  attempted: number
  accepted: number
  rejected: number
  networkError: boolean
}

export async function tryFlushQueue(shiftId: string): Promise<FlushResult> {
  // Single-flight — параллельные вызовы (foreground interval + background
  // task + network-restore listener) не должны double-ingest.
  if (flushInFlight) {
    await flushInFlight
    return { attempted: 0, accepted: 0, rejected: 0, networkError: false }
  }
  let result: FlushResult = { attempted: 0, accepted: 0, rejected: 0, networkError: false }
  flushInFlight = (async () => {
    result = await doFlush(shiftId)
  })()
  try {
    await flushInFlight
  } finally {
    flushInFlight = null
  }
  return result
}

async function doFlush(shiftId: string): Promise<FlushResult> {
  const empty: FlushResult = { attempted: 0, accepted: 0, rejected: 0, networkError: false }

  // Network check — избегаем лишних fetch calls когда точно offline.
  // NetInfo reports `isConnected=false` на airplane mode / no signal.
  try {
    const netState = await NetInfo.fetch()
    if (netState.isConnected === false) {
      return empty
    }
  } catch {
    // NetInfo недоступен (unlikely) → продолжаем, fetch выбросит NetworkError если offline.
  }

  const pending = await getPendingPings(shiftId, BATCH_SIZE)
  if (pending.length === 0) return empty

  try {
    const response = await ingestPings(shiftId, {
      pings: pending.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        accuracyMeters: p.accuracyMeters,
        recordedAt: p.recordedAt,
        insideGeofence: p.insideGeofence,
      })),
    })
    const allIds = pending.map((p) => p.id)
    // Server partial-reject по index в нашем batch'е. Accepted — первые
    // N (server гарантирует: rejected[i].index — индекс в отправленном
    // массиве, мы помечаем ВСЕ как synced — invalid'ам нет смысла
    // retry'ить, они вечные refuse).
    await markSynced(allIds)
    return {
      attempted: pending.length,
      accepted: response.accepted,
      rejected: response.rejected.length,
      networkError: false,
    }
  } catch (err) {
    if (err instanceof NetworkError) {
      await incrementAttempts(pending.map((p) => p.id))
      return { ...empty, networkError: true }
    }
    if (err instanceof ApiError && err.status >= 500) {
      await incrementAttempts(pending.map((p) => p.id))
      return empty
    }
    // ApiError 4xx (403 — чужая смена после role change, 422 — shift ended)
    // — irrecoverable. Mark synced чтобы не бесконечно retry'ить, сервер
    // не примет их никогда. Это корректно т.к. смена закончилась и мы
    // получили данные после end — они всё равно не нужны.
    if (err instanceof ApiError && (err.status === 403 || err.status === 422)) {
      await markSynced(pending.map((p) => p.id))
      return empty
    }
    // Unknown — оставляем в queue на retry.
    await incrementAttempts(pending.map((p) => p.id))
    return empty
  }
}

/** Test-only: сброс single-flight promise. */
export function __resetSyncForTests(): void {
  flushInFlight = null
}

/** Exposed для tests — позволяет stub'ать. */
export type { QueuedPing }
