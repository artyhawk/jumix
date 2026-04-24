import { type SQLiteDatabase, openDatabaseAsync } from 'expo-sqlite'

/**
 * Offline pings queue (M5-b, ADR 0007 §2).
 *
 * Pings записываются в local SQLite при каждом location update
 * (foreground interval / background TaskManager). Sync-слой (`sync.ts`)
 * flush'ает pending rows batch'ами до 50 к `POST /shifts/:id/pings`.
 *
 * **Schema:**
 * ```
 * location_pings_queue (
 *   id INTEGER PK AUTOINCREMENT,
 *   shift_id TEXT NOT NULL,
 *   latitude REAL NOT NULL,
 *   longitude REAL NOT NULL,
 *   accuracy_meters REAL,
 *   recorded_at TEXT NOT NULL,     -- ISO 8601
 *   inside_geofence INTEGER,        -- 0/1 boolean; NULL = unknown
 *   synced_at TEXT,                 -- ISO; NULL = pending
 *   attempts INTEGER NOT NULL DEFAULT 0
 * )
 * INDEX idx_pending ON location_pings_queue(synced_at) WHERE synced_at IS NULL
 * INDEX idx_shift_time ON location_pings_queue(shift_id, recorded_at DESC)
 * ```
 *
 * **Retention:** `cleanup()` удаляет synced rows старше 7 дней. Failed
 * rows (attempts > 10) остаются в DB — surface в UI как warning banner
 * (backlog).
 */

const DB_NAME = 'jumix-tracking.db'

let dbPromise: Promise<SQLiteDatabase> | null = null

async function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(DB_NAME)
  }
  return dbPromise
}

export async function initQueue(): Promise<void> {
  const db = await getDatabase()
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS location_pings_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy_meters REAL,
      recorded_at TEXT NOT NULL,
      inside_geofence INTEGER,
      synced_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_pings_pending
      ON location_pings_queue(synced_at) WHERE synced_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pings_shift_time
      ON location_pings_queue(shift_id, recorded_at DESC);
  `)
}

export interface QueuedPing {
  id: number
  shiftId: string
  latitude: number
  longitude: number
  accuracyMeters: number | null
  recordedAt: string
  insideGeofence: boolean | null
  syncedAt: string | null
  attempts: number
}

export interface PingToEnqueue {
  latitude: number
  longitude: number
  accuracyMeters: number | null
  recordedAt: string
  insideGeofence: boolean | null
}

export async function enqueuePing(shiftId: string, ping: PingToEnqueue): Promise<void> {
  const db = await getDatabase()
  await db.runAsync(
    `INSERT INTO location_pings_queue
       (shift_id, latitude, longitude, accuracy_meters, recorded_at, inside_geofence)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      shiftId,
      ping.latitude,
      ping.longitude,
      ping.accuracyMeters,
      ping.recordedAt,
      ping.insideGeofence === null ? null : ping.insideGeofence ? 1 : 0,
    ],
  )
}

/**
 * Pending pings (synced_at IS NULL), сортируем по recorded_at ASC чтобы
 * server получил хронологическом порядке — важно для server'ского
 * geofence transition detection (сравнение prev vs latest).
 */
export async function getPendingPings(shiftId: string, limit = 50): Promise<QueuedPing[]> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<RawRow>(
    `SELECT id, shift_id, latitude, longitude, accuracy_meters, recorded_at,
            inside_geofence, synced_at, attempts
     FROM location_pings_queue
     WHERE shift_id = ? AND synced_at IS NULL
     ORDER BY recorded_at ASC
     LIMIT ?`,
    [shiftId, limit],
  )
  return rows.map(hydrate)
}

/**
 * Recent pings (любой sync-state) для geofence state computation на
 * active-shift screen. DESC по времени; типично N=2-3.
 */
export async function getRecentPings(shiftId: string, limit = 3): Promise<QueuedPing[]> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<RawRow>(
    `SELECT id, shift_id, latitude, longitude, accuracy_meters, recorded_at,
            inside_geofence, synced_at, attempts
     FROM location_pings_queue
     WHERE shift_id = ?
     ORDER BY recorded_at DESC
     LIMIT ?`,
    [shiftId, limit],
  )
  return rows.map(hydrate)
}

export async function markSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getDatabase()
  const placeholders = ids.map(() => '?').join(',')
  await db.runAsync(`UPDATE location_pings_queue SET synced_at = ? WHERE id IN (${placeholders})`, [
    new Date().toISOString(),
    ...ids,
  ])
}

/** Increment attempts counter для pending rows — trace retry logic. */
export async function incrementAttempts(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getDatabase()
  const placeholders = ids.map(() => '?').join(',')
  await db.runAsync(
    `UPDATE location_pings_queue SET attempts = attempts + 1 WHERE id IN (${placeholders})`,
    ids,
  )
}

export async function countPending(shiftId?: string): Promise<number> {
  const db = await getDatabase()
  if (shiftId) {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM location_pings_queue WHERE synced_at IS NULL AND shift_id = ?',
      [shiftId],
    )
    return row?.n ?? 0
  }
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM location_pings_queue WHERE synced_at IS NULL',
  )
  return row?.n ?? 0
}

/**
 * Retention: удаляет synced pings старше 7 дней. Failed pings
 * (attempts > 10, synced_at=NULL) не трогаем — surface в UI (backlog).
 * Вызывать на cold-start или периодически.
 */
export async function cleanup(retentionDays = 7): Promise<void> {
  const db = await getDatabase()
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  await db.runAsync(
    'DELETE FROM location_pings_queue WHERE synced_at IS NOT NULL AND synced_at < ?',
    [cutoff],
  )
}

/** Test-only: сброс cached database + удаление таблицы. */
export async function __resetQueueForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise
      await db.execAsync('DROP TABLE IF EXISTS location_pings_queue')
      await db.closeAsync()
    } catch {
      // ignore — возможно DB уже закрыта
    }
  }
  dbPromise = null
}

// ---------- internals ----------

interface RawRow {
  id: number
  shift_id: string
  latitude: number
  longitude: number
  accuracy_meters: number | null
  recorded_at: string
  inside_geofence: number | null
  synced_at: string | null
  attempts: number
}

function hydrate(row: RawRow): QueuedPing {
  return {
    id: row.id,
    shiftId: row.shift_id,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracy_meters,
    recordedAt: row.recorded_at,
    insideGeofence: row.inside_geofence === null ? null : row.inside_geofence === 1,
    syncedAt: row.synced_at,
    attempts: row.attempts,
  }
}
