import { z } from 'zod'

/**
 * Zod-схемы для shift endpoints (M4, ADR 0006). DTO-типы через z.infer.
 */

const notesSchema = z.string().trim().min(1).max(2000)
const shiftStatusSchema = z.enum(['active', 'paused', 'ended'])

export const startShiftSchema = z.object({
  craneId: z.string().uuid(),
  notes: notesSchema.optional(),
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

export { shiftStatusSchema }
