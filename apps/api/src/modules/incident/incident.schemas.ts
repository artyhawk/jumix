import { z } from 'zod'

/**
 * Zod-схемы incident endpoints (M6, ADR 0008).
 */

export const incidentTypeSchema = z.enum([
  'crane_malfunction',
  'material_fall',
  'near_miss',
  'minor_injury',
  'safety_violation',
  'other',
])

export const incidentSeveritySchema = z.enum(['info', 'warning', 'critical'])

export const incidentStatusSchema = z.enum(['submitted', 'acknowledged', 'resolved', 'escalated'])

export const requestPhotoUploadUrlSchema = z.object({
  contentType: z
    .string()
    .min(1)
    .regex(/^image\/(jpeg|jpg|png|webp|heic|heif)$/i, 'unsupported content type'),
  filename: z.string().trim().min(1).max(120),
})

export const createIncidentSchema = z.object({
  type: incidentTypeSchema,
  severity: incidentSeveritySchema,
  description: z.string().trim().min(10).max(2000),
  photoKeys: z.array(z.string().min(1).max(500)).max(5).default([]),
  shiftId: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

export const idParamSchema = z.object({
  id: z.string().uuid(),
})

export const resolveIncidentSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
})

export const escalateIncidentSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
})

export const listMyQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const listOrgQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: incidentStatusSchema.optional(),
  severity: incidentSeveritySchema.optional(),
  type: incidentTypeSchema.optional(),
  siteId: z.string().uuid().optional(),
  craneId: z.string().uuid().optional(),
})

export type RequestPhotoUploadUrlInput = z.infer<typeof requestPhotoUploadUrlSchema>
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>
export type ResolveIncidentInput = z.infer<typeof resolveIncidentSchema>
export type EscalateIncidentInput = z.infer<typeof escalateIncidentSchema>
export type ListMyQuery = z.infer<typeof listMyQuerySchema>
export type ListOrgQuery = z.infer<typeof listOrgQuerySchema>
