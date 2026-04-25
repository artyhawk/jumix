import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { incidents } from './incidents'

/**
 * incident_photos (M6, ADR 0008) — multi-photo per incident (up to 5 в MVP,
 * enforced на service-слое). Three-phase upload pattern reused from M3
 * license: client requests presigned PUT, PUTs file, передаёт `key` в
 * incident create. Backend validates (HEAD + prefix-match + content-type +
 * size) перед persisting.
 *
 * `storage_key` стандартизирован: `incidents/{incidentId}/photos/{filename}`,
 * but key generation предшествует incident creation — server использует
 * temporary scope `pending/{userId}/{uuid}/{filename}` который потом
 * "claimed" при confirm. Backlog: storage cleanup для never-claimed pending
 * uploads.
 *
 * ON DELETE CASCADE — фото удаляются вместе с incident'ом (но storage objects
 * remain — backlog retention).
 */
export const incidentPhotos = pgTable(
  'incident_photos',
  {
    id: uuid().primaryKey().defaultRandom(),
    incidentId: uuid()
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    storageKey: text().notNull(),
    uploadedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('incident_photos_incident_idx').on(t.incidentId)],
)

export type IncidentPhoto = {
  id: string
  incidentId: string
  storageKey: string
  uploadedAt: Date
}

export type NewIncidentPhoto = typeof incidentPhotos.$inferInsert
