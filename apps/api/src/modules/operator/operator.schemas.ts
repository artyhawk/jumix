import { iinSchema, phoneSchema } from '@jumix/shared'
import { z } from 'zod'

/**
 * Zod-схемы для operators endpoints. По умолчанию Zod-object strip-режим —
 * незнакомые поля молча удаляются. Это ЗНАЧИТ попытки передать
 * `organizationId` / `userId` / `status` / `availability` / `avatarKey`
 * в create/update/query просто игнорируются, а не бросают 422. Защита
 * от injection'а обеспечивается тем, что
 *   1) service достаёт tenant scope ИСКЛЮЧИТЕЛЬНО из `ctx` (AuthContext),
 *   2) status-change идёт через отдельный endpoint с whitelist-schema,
 *   3) self-update whitelist'ит только ФИО.
 * Тесты проверяют именно факт «значение проигнорировано», а не 422.
 */

const firstNameSchema = z.string().trim().min(1).max(100)
const lastNameSchema = z.string().trim().min(1).max(100)
const patronymicSchema = z.string().trim().min(1).max(100)
const specializationSchema = z.record(z.unknown())
const reasonSchema = z.string().trim().min(1).max(500)

/**
 * POST /api/v1/operators — admin create. Создаёт user + operator атомарно.
 * НЕ принимает status/availability/avatarKey/userId/organizationId.
 */
export const createOperatorSchema = z.object({
  phone: phoneSchema,
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  patronymic: patronymicSchema.optional(),
  iin: iinSchema,
  hiredAt: z.coerce.date().optional(),
  specialization: specializationSchema.optional(),
})
export type CreateOperatorInput = z.infer<typeof createOperatorSchema>

/**
 * PATCH /api/v1/operators/:id — admin update. status через отдельный endpoint;
 * phone/email иммутабельны после create (смена phone — backlog). avatarKey
 * через self avatar flow, не admin.
 */
export const updateOperatorAdminSchema = z
  .object({
    firstName: firstNameSchema.optional(),
    lastName: lastNameSchema.optional(),
    patronymic: patronymicSchema.nullable().optional(),
    iin: iinSchema.optional(),
    hiredAt: z.coerce.date().nullable().optional(),
    terminatedAt: z.coerce.date().nullable().optional(),
    specialization: specializationSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
export type UpdateOperatorAdminInput = z.infer<typeof updateOperatorAdminSchema>

export const changeOperatorStatusSchema = z.object({
  status: z.enum(['active', 'blocked', 'terminated']),
  reason: reasonSchema.optional(),
})
export type ChangeOperatorStatusInput = z.infer<typeof changeOperatorStatusSchema>

/**
 * GET /api/v1/operators — список. Cursor = last seen id (id DESC).
 * `organizationId` ОТСУТСТВУЕТ в схеме — Zod strip-режим молча удаляет
 * это поле из query, и service использует ctx.organizationId как
 * единственный источник scope. Owner НЕ МОЖЕТ читать чужую организацию
 * через query-param — запрос вернёт только его org даже при
 * `?organizationId=<orgB>`.
 */
export const listOperatorsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'blocked', 'terminated']).optional(),
})
export type ListOperatorsQuery = z.infer<typeof listOperatorsQuerySchema>

export const operatorIdParamsSchema = z.object({
  id: z.string().uuid(),
})
