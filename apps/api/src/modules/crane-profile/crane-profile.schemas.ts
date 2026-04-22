import { iinSchema } from '@jumix/shared'
import { z } from 'zod'

/**
 * Zod-схемы для crane-profile endpoints.
 *
 * Strip-режим молча удаляет незнакомые поля — попытки передать userId,
 * approvalStatus, avatarKey через body/query игнорируются. Защита от
 * injection'а обеспечивается тем, что:
 *   1) tenant scope идёт через ctx (operator → ctx.userId; superadmin → global);
 *   2) approval_status меняется ТОЛЬКО через отдельные endpoints;
 *   3) self-update whitelist'ит только ФИО.
 */

const firstNameSchema = z.string().trim().min(1).max(100)
const lastNameSchema = z.string().trim().min(1).max(100)
const patronymicSchema = z.string().trim().min(1).max(100)
const specializationSchema = z.record(z.unknown())
const reasonSchema = z.string().trim().min(1).max(500)

/**
 * PATCH /api/v1/crane-profiles/:id — superadmin admin update. ИИН меняется
 * здесь (platform-level identity). Approval-переходы идут через
 * :id/approve и :id/reject.
 */
export const updateCraneProfileAdminSchema = z
  .object({
    firstName: firstNameSchema.optional(),
    lastName: lastNameSchema.optional(),
    patronymic: patronymicSchema.nullable().optional(),
    iin: iinSchema.optional(),
    specialization: specializationSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
export type UpdateCraneProfileAdminInput = z.infer<typeof updateCraneProfileAdminSchema>

/**
 * PATCH /api/v1/crane-profiles/me — self update. Whitelist: только ФИО.
 * ИИН / specialization правит superadmin (уважение identity-инварианта:
 * оператор не может «переписать» свою идентичность).
 */
export const updateCraneProfileSelfSchema = z
  .object({
    firstName: firstNameSchema.optional(),
    lastName: lastNameSchema.optional(),
    patronymic: patronymicSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
export type UpdateCraneProfileSelfInput = z.infer<typeof updateCraneProfileSelfSchema>

export const rejectCraneProfileSchema = z.object({
  reason: reasonSchema,
})
export type RejectCraneProfileInput = z.infer<typeof rejectCraneProfileSchema>

export const avatarUploadUrlRequestSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png']),
})
export type AvatarUploadUrlRequest = z.infer<typeof avatarUploadUrlRequestSchema>

export const confirmAvatarSchema = z.object({
  key: z.string().min(1).max(512),
})
export type ConfirmAvatarInput = z.infer<typeof confirmAvatarSchema>

/**
 * License upload (ADR 0005). Content-type whitelist соответствует ТЗ §5.1.5.1
 * (JPG / PNG / PDF). Filename whitelist'нут на server-side через
 * `sanitizeFilename` в object-key.ts — здесь достаточно non-empty bounds.
 */
const licenseFilenameSchema = z.string().trim().min(1).max(120)

export const licenseUploadUrlRequestSchema = z
  .object({
    contentType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
    filename: licenseFilenameSchema,
  })
  .strict()
export type LicenseUploadUrlRequest = z.infer<typeof licenseUploadUrlRequestSchema>

/**
 * Confirm-license body. expiresAt приходит как ISO-date из клиента:
 *   - future > now (нельзя загрузить уже просроченное удостоверение)
 *   - ≤ now + 20 лет (sanity — удостоверение действует максимум 5 лет в РК,
 *     но граница щедрая чтобы пропустить редкие edge-cases)
 */
const TWENTY_YEARS_MS = 20 * 365 * 24 * 60 * 60 * 1000

export const confirmLicenseSchema = z
  .object({
    key: z.string().min(1).max(512),
    expiresAt: z.coerce
      .date()
      .refine((d) => d.getTime() > Date.now(), {
        message: 'License expiry must be in the future',
      })
      .refine((d) => d.getTime() < Date.now() + TWENTY_YEARS_MS, {
        message: 'License expiry unreasonably far in the future (max 20 years)',
      }),
  })
  .strict()
export type ConfirmLicenseInput = z.infer<typeof confirmLicenseSchema>

/**
 * GET /api/v1/crane-profiles — superadmin identity pool.
 * `approvalStatus` default не задаётся — superadmin сам решает, смотрит ли
 * он approved (по умолчанию «всех кроме pending» странное поведение, поэтому
 * без фильтра возвращаем все approval-состояния).
 */
export const listCraneProfilesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected', 'all']).default('all'),
})
export type ListCraneProfilesQuery = z.infer<typeof listCraneProfilesQuerySchema>

export const craneProfileIdParamsSchema = z.object({
  id: z.string().uuid(),
})
