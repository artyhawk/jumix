import { z } from 'zod'
import { phoneSchema } from '../../../lib/phone'

/** Запрос SMS-кода. IP берётся из request, не из body. */
export const smsRequestSchema = z.object({
  phone: phoneSchema,
})
export type SmsRequestBody = z.infer<typeof smsRequestSchema>

/** Верификация кода. Код — ровно 6 цифр. */
export const smsVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^[0-9]{6}$/, 'Code must be 6 digits'),
  // deviceKind определяется серверно по User-Agent, но клиент может подсказать.
  clientKind: z.enum(['web', 'mobile']).default('web'),
  deviceId: z.string().max(128).optional(),
})
export type SmsVerifyBody = z.infer<typeof smsVerifySchema>
