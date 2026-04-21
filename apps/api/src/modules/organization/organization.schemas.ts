import { binSchema, phoneSchema } from '@jumix/shared'
import { z } from 'zod'

/**
 * Zod-схемы для organizations endpoints. Все строки обрезаем/нормализуем
 * на границе API. DTO-типы выводим через z.infer для single-source-of-truth.
 */

const nameSchema = z.string().trim().min(1).max(200)
const emailSchema = z.string().trim().toLowerCase().email().max(254)

/** Поля организации, которые можно менять через PATCH. Используется и в
 *  schema (ключи), и в policy (whitelist для owner). */
export const UPDATE_ORGANIZATION_FIELDS = [
  'name',
  'bin',
  'contactName',
  'contactPhone',
  'contactEmail',
] as const
export type UpdateOrganizationField = (typeof UPDATE_ORGANIZATION_FIELDS)[number]

/**
 * POST /api/v1/organizations — body.
 *
 * В одной транзакции создаётся организация + первый owner. Owner логинится
 * через SMS (пароль задаст позже через password-reset flow), поэтому здесь
 * пароль не принимаем.
 */
export const createOrganizationSchema = z.object({
  name: nameSchema,
  bin: binSchema,
  contactName: nameSchema.optional(),
  contactPhone: phoneSchema.optional(),
  contactEmail: emailSchema.optional(),
  ownerPhone: phoneSchema,
  ownerName: nameSchema,
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>

/**
 * PATCH /api/v1/organizations/:id — partial update.
 *
 * Superadmin может менять всё (name, bin, contacts); owner — только
 * contactName/contactPhone/contactEmail своей организации. Status НЕ меняется
 * через PATCH — для него отдельные action endpoints (/suspend, /activate).
 *
 * `null` явно различаем от `undefined`: null = очистить поле, undefined = не трогать.
 */
export const updateOrganizationSchema = z
  .object({
    name: nameSchema.optional(),
    bin: binSchema.optional(),
    contactName: nameSchema.nullable().optional(),
    contactPhone: phoneSchema.nullable().optional(),
    contactEmail: emailSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

/**
 * GET /api/v1/organizations — query.
 *
 * Cursor = last seen id (id DESC). Limit clamped [1..100]. Search по
 * name/bin (подстрока, case-insensitive). Status-фильтр опционален.
 */
export const listOrganizationsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'suspended', 'archived']).optional(),
})

export type ListOrganizationsQuery = z.infer<typeof listOrganizationsQuerySchema>

/** Path params для /:id endpoints — валидация что id это uuid. */
export const organizationIdParamsSchema = z.object({
  id: z.string().uuid(),
})
