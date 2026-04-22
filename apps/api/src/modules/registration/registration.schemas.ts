import { iinSchema, phoneSchema } from '@jumix/shared'
import { z } from 'zod'

/**
 * Zod-схемы для public registration endpoints (ADR 0004).
 *
 * Обе ручки публичные (без `app.authenticate`), поэтому валидация тут —
 * единственная граница между request и service. Strip-режим Fastify-ajv/Zod
 * (`removeAdditional: 'all'`) срезает любые лишние поля — попытки протащить
 * `organizationId`, `role`, `approvalStatus` через body игнорируются.
 *
 * `clientKind` / `deviceId` вынесены наружу как в sms.schemas — TokenIssuerService
 * по ним подбирает refresh TTL (mobile 90 дней / web 30), см. CLAUDE.md §5.1.
 */

const firstNameSchema = z.string().trim().min(1).max(100)
const lastNameSchema = z.string().trim().min(1).max(100)
const patronymicSchema = z.string().trim().min(1).max(100)
const specializationSchema = z.record(z.unknown())

/**
 * POST /api/v1/registration/start — запрос OTP.
 * IP + User-Agent берутся сервером из request headers.
 */
export const startRegistrationSchema = z.object({
  phone: phoneSchema,
})
export type StartRegistrationInput = z.infer<typeof startRegistrationSchema>

/**
 * POST /api/v1/registration/verify — верификация OTP + создание user/профиля.
 *
 * ФИО и ИИН приходят в том же вызове, что и OTP (ADR 0004 §«Двухфазный flow»):
 * мобильный клиент собирает их на одной странице, три-фазный split означал бы
 * промежуточный temp-токен без UX-выигрыша.
 */
export const verifyRegistrationSchema = z.object({
  phone: phoneSchema,
  otp: z.string().regex(/^[0-9]{6}$/, 'Code must be 6 digits'),
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  patronymic: patronymicSchema.nullable().optional(),
  iin: iinSchema,
  specialization: specializationSchema.optional(),
  clientKind: z.enum(['web', 'mobile']).default('mobile'),
  deviceId: z.string().max(128).optional(),
})
export type VerifyRegistrationInput = z.infer<typeof verifyRegistrationSchema>
