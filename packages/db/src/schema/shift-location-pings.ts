import { sql } from 'drizzle-orm'
import { boolean, check, index, numeric, pgTable, real, timestamp, uuid } from 'drizzle-orm/pg-core'
import { shifts } from './shifts'

/**
 * Shift location pings (M5, ADR 0007) — GPS telemetry from mobile client
 * during active/paused shift. Mobile buffers в локальной SQLite queue и
 * flush'ает batch'ами (до 100) в `POST /api/v1/shifts/:id/pings`.
 *
 * Columns:
 *   - `latitude` / `longitude` — numeric(10,7) дают precision ~11mm на экваторе,
 *     достаточно для construction-site геозон (radius 50-500m типично).
 *   - `accuracy_meters` — reported GPS accuracy (real — enough precision для
 *     radius tolerance calculation). Null если клиент не получил.
 *   - `recorded_at` — UTC timestamp когда ping был *записан* на устройстве.
 *     Не совпадает с `created_at` (server insert time) — offline pings могут
 *     быть delayed на минуты/часы до sync.
 *   - `inside_geofence` — nullable. Client-side computed boolean: ping попадает
 *     в site.geofenceRadiusM (с accuracy tolerance). Null если site coords
 *     недоступны на mobile (edge case).
 *
 * ON DELETE CASCADE на shift_id: pings живут только вместе со shift'ом.
 * В MVP shifts не soft-delete'ятся, cascade фактически никогда не trigger'ится.
 */
export const shiftLocationPings = pgTable(
  'shift_location_pings',
  {
    id: uuid().primaryKey().defaultRandom(),
    shiftId: uuid()
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),
    latitude: numeric({ precision: 10, scale: 7 }).notNull(),
    longitude: numeric({ precision: 10, scale: 7 }).notNull(),
    accuracyMeters: real(),
    recordedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    insideGeofence: boolean(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // "Latest ping per shift" + "full path ordered by time" — single index
    // serves both (shiftId filter + recorded_at DESC sort).
    index('shift_location_pings_shift_time_idx').on(t.shiftId, sql`${t.recordedAt} DESC`),
    check('shift_location_pings_lat_range_chk', sql`${t.latitude} BETWEEN -90 AND 90`),
    check('shift_location_pings_lng_range_chk', sql`${t.longitude} BETWEEN -180 AND 180`),
    check(
      'shift_location_pings_accuracy_nonneg_chk',
      sql`${t.accuracyMeters} IS NULL OR ${t.accuracyMeters} >= 0`,
    ),
  ],
)

/**
 * Hydrated row: latitude/longitude берутся из DB как строки (numeric), но
 * upstream expects number (compatible с mobile JSON + client coords). Сервис
 * конвертирует через Number() при hydrate. Accuracy real тоже нужно Number'овать
 * (drizzle иногда отдаёт как string в зависимости от pg-driver).
 */
export type ShiftLocationPing = {
  id: string
  shiftId: string
  latitude: number
  longitude: number
  accuracyMeters: number | null
  recordedAt: Date
  insideGeofence: boolean | null
  createdAt: Date
}

export type NewShiftLocationPing = typeof shiftLocationPings.$inferInsert
