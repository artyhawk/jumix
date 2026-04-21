import { z } from 'zod'

/**
 * Zod-схемы для sites endpoints. Строки обрезаются/нормализуются на границе API.
 * Все DTO-типы выводятся через z.infer.
 *
 * Про формат координат: lat/lng идут как ОТДЕЛЬНЫЕ поля в JSON (не массив,
 * не {lat,lng}-объект). Причина: классический bug-источник — [lng, lat]
 * порядок GeoJSON vs [lat, lng] человеческая привычка. Отдельные именованные
 * поля снимают двусмысленность на уровне API. Repository при записи в PostGIS
 * меняет порядок на (lng, lat), handler про это не знает.
 */

const nameSchema = z.string().trim().min(1).max(200)
const addressSchema = z.string().trim().min(1).max(500)
const notesSchema = z.string().trim().min(1).max(2000)
const latitudeSchema = z.number().min(-90).max(90)
const longitudeSchema = z.number().min(-180).max(180)
const radiusSchema = z.number().int().min(1).max(10000)

/**
 * Поля, которые меняются через PATCH /sites/:id. Для владельцев/суперадмина
 * доступны все — политика на уровне site'а (не field-level) как у
 * organizations.contacts, потому что у site'а нет «чувствительных» полей
 * типа финансов.
 */
export const UPDATE_SITE_FIELDS = [
  'name',
  'address',
  'latitude',
  'longitude',
  'radiusM',
  'notes',
] as const
export type UpdateSiteField = (typeof UPDATE_SITE_FIELDS)[number]

export const createSiteSchema = z.object({
  name: nameSchema,
  address: addressSchema.optional(),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  radiusM: radiusSchema.default(150),
  notes: notesSchema.optional(),
})
export type CreateSiteInput = z.infer<typeof createSiteSchema>

/**
 * PATCH: null vs undefined различаем — null очищает nullable-поле (address,
 * notes), undefined означает «не трогать».
 *
 * latitude и longitude должны приходить парой. Одно без другого — 422, иначе
 * мы рискуем получить PostGIS-ошибку на update с половинчатой координатой.
 */
export const updateSiteSchema = z
  .object({
    name: nameSchema.optional(),
    address: addressSchema.nullable().optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    radiusM: radiusSchema.optional(),
    notes: notesSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: 'latitude and longitude must be provided together',
    path: ['latitude'],
  })
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>

/**
 * GET /sites — cursor = last seen id (id DESC). Search по name/address.
 * Status-фильтр опциональный; без фильтра — все видимые статусы, включая
 * archived (archived не скрываются сервером, UI решает показывать ли их).
 */
export const listSitesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
})
export type ListSitesQuery = z.infer<typeof listSitesQuerySchema>

export const siteIdParamsSchema = z.object({
  id: z.string().uuid(),
})
