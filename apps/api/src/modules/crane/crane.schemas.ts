import { z } from 'zod'

/**
 * Zod-схемы для cranes endpoints. DTO-типы выводятся через z.infer.
 *
 * tariffs_json принимается как свободный `z.record(z.unknown())` — финальная
 * структура придёт с payroll-спекой (Этап 3), см. backlog.md `Cranes`.
 * Payroll engine это поле пока не читает; любой валидный JSON-объект ок.
 */

const modelSchema = z.string().trim().min(1).max(200)
const inventoryNumberSchema = z.string().trim().min(1).max(100)
const notesSchema = z.string().trim().min(1).max(2000)
const capacityTonSchema = z.number().positive().max(999_999.99)
const boomLengthSchema = z.number().positive().max(9_999.99)
const tariffsJsonSchema = z.record(z.unknown())

// CHECK range в миграции считает год manufacture от now(). На API дополнительно
// отсекаем явно глупые значения (до-паровой эпохи), остальное — уровень БД.
const CURRENT_YEAR = () => new Date().getUTCFullYear()
const yearManufacturedSchema = z.number().int().min(1900).max(CURRENT_YEAR())

const craneTypeSchema = z.enum(['tower', 'mobile', 'crawler', 'overhead'])
const craneStatusSchema = z.enum(['active', 'maintenance', 'retired'])

export const createCraneSchema = z.object({
  type: craneTypeSchema,
  model: modelSchema,
  inventoryNumber: inventoryNumberSchema.optional(),
  capacityTon: capacityTonSchema,
  boomLengthM: boomLengthSchema.optional(),
  yearManufactured: yearManufacturedSchema.optional(),
  siteId: z.string().uuid().optional(),
  tariffsJson: tariffsJsonSchema.default({}),
  notes: notesSchema.optional(),
})
export type CreateCraneInput = z.infer<typeof createCraneSchema>

/**
 * PATCH: nullable-поля различают null (очистить) от undefined (не трогать).
 * `siteId: null` — перевести в «без дислокации» (на склад).
 * `inventoryNumber: null` — убрать номер. Status через отдельные action-endpoints.
 */
export const updateCraneSchema = z
  .object({
    type: craneTypeSchema.optional(),
    model: modelSchema.optional(),
    inventoryNumber: inventoryNumberSchema.nullable().optional(),
    capacityTon: capacityTonSchema.optional(),
    boomLengthM: boomLengthSchema.nullable().optional(),
    yearManufactured: yearManufacturedSchema.nullable().optional(),
    siteId: z.string().uuid().nullable().optional(),
    tariffsJson: tariffsJsonSchema.optional(),
    notes: notesSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
export type UpdateCraneInput = z.infer<typeof updateCraneSchema>

/**
 * GET /cranes — cursor = last seen id (id DESC). Список по умолчанию
 * исключает soft-deleted (deleted_at IS NOT NULL). Фильтры status/type/siteId —
 * опциональны. siteId=null фильтрует «на складе» (без площадки).
 */
export const listCranesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  status: craneStatusSchema.optional(),
  type: craneTypeSchema.optional(),
  siteId: z.string().uuid().optional(),
})
export type ListCranesQuery = z.infer<typeof listCranesQuerySchema>

export const craneIdParamsSchema = z.object({
  id: z.string().uuid(),
})
