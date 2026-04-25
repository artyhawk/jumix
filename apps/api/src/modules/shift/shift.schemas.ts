import { CHECKLIST_ITEMS } from '@jumix/shared'
import { z } from 'zod'

/**
 * Zod-схемы для shift endpoints (M4, ADR 0006). DTO-типы через z.infer.
 */

const notesSchema = z.string().trim().min(1).max(2000)
const shiftStatusSchema = z.enum(['active', 'paused', 'ended'])

/**
 * Pre-shift checklist item (M6, ADR 0008). photoKey — pending-prefix
 * scoped по reporter_user_id; backend validates ownership на confirm
 * (атомарно с insert checklist row). notes — optional 200 chars.
 */
const checklistItemSchema = z.object({
  checked: z.boolean(),
  photoKey: z.string().max(500).nullable().default(null),
  notes: z.string().trim().max(200).nullable().default(null),
})

const checklistItemsSchema = z
  .record(z.enum(CHECKLIST_ITEMS), checklistItemSchema)
  .refine((items) => Object.keys(items).length > 0, 'checklist items must not be empty')

const checklistSubmissionSchema = z.object({
  items: checklistItemsSchema,
  generalNotes: z.string().trim().max(500).nullable().optional(),
})

export const startShiftSchema = z.object({
  craneId: z.string().uuid(),
  notes: notesSchema.optional(),
  checklist: checklistSubmissionSchema,
})
export type StartShiftInput = z.infer<typeof startShiftSchema>

export const endShiftSchema = z.object({
  notes: notesSchema.optional(),
})
export type EndShiftInput = z.infer<typeof endShiftSchema>

export const shiftIdParamsSchema = z.object({
  id: z.string().uuid(),
})

/** GET /shifts/my — operator's own shift history. */
export const listMyShiftsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListMyShiftsQuery = z.infer<typeof listMyShiftsQuerySchema>

/**
 * GET /shifts/owner — org-scoped list для owner/superadmin.
 * status 'all' → любой; default filter 'active' — показать текущие живые смены.
 * siteId/craneId — optional narrow-down.
 */
export const listOwnerShiftsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'paused', 'ended', 'live', 'all']).default('live'),
  siteId: z.string().uuid().optional(),
  craneId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})
export type ListOwnerShiftsQuery = z.infer<typeof listOwnerShiftsQuerySchema>

// ---------- M5: GPS tracking (ADR 0007) ----------

/**
 * Single location ping. `insideGeofence` nullable — client computes locally,
 * но если site coords недоступны (edge case) → null. Server не перерассчитывает
 * (trust client) — geofence — advisory UX anyway.
 */
export const locationPingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().nullable(),
  recordedAt: z.string().datetime({ offset: true }),
  insideGeofence: z.boolean().nullable(),
})
export type LocationPingInput = z.infer<typeof locationPingSchema>

/**
 * Batch ingest body. Max 100 pings per request — cap задан DoS-защитой и
 * memory concerns (одна смена 8ч × 60s = 480 pings; 100 batch = 5 round trips
 * для full sync). Min 1 — empty array → 422.
 */
export const ingestPingsSchema = z.object({
  pings: z.array(locationPingSchema).min(1).max(100),
})
export type IngestPingsInput = z.infer<typeof ingestPingsSchema>

/**
 * GET /shifts/:id/path?sampleRate=N — downsample для визуализации маршрута.
 * Default 1 = все pings; N>1 = каждый N-ый (округление вниз). Max 20 — больше
 * не имеет смысла (500 pings / 20 = 25 points, уже loss of detail).
 */
export const shiftPathQuerySchema = z.object({
  sampleRate: z.coerce.number().int().min(1).max(20).default(1),
})
export type ShiftPathQuery = z.infer<typeof shiftPathQuerySchema>

/**
 * GET /shifts/owner/locations-latest?siteId=... — опциональный фильтр по site.
 * Scope всегда ctx.organizationId (или all для superadmin).
 */
export const ownerLocationsLatestQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
})
export type OwnerLocationsLatestQuery = z.infer<typeof ownerLocationsLatestQuerySchema>

export { shiftStatusSchema }
