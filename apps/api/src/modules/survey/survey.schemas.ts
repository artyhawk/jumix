import { z } from 'zod'

/**
 * Zod-схемы survey endpoints (B3-SURVEY).
 *
 * Public submission contract намеренно тонкий: contact-fields + answers
 * keyed by question position. Backend дополнительно валидирует что все
 * required questions покрыты (against survey_questions для конкретного
 * survey_id).
 *
 * Honeypot — string-optional. Если заполнен → 200 OK с DB marker (anti-bot
 * без раскрытия защиты).
 */

export const slugParamSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'invalid slug'),
})

export const submitSurveyResponseSchema = z.object({
  fullName: z.string().trim().min(2, 'Введите имя и фамилию').max(200),
  phone: z.string().regex(/^\+7[0-9]{10}$/, 'Телефон должен быть в формате +7XXXXXXXXXX'),
  email: z.string().trim().toLowerCase().email('Неверный формат email').max(200),
  answers: z
    .record(z.string(), z.string().trim().min(1).max(5000))
    .refine((v) => Object.keys(v).length > 0, { message: 'answers must be non-empty' }),
  honeypot: z.string().max(500).optional(),
})

export const idParamSchema = z.object({
  id: z.string().uuid(),
})

export const listResponsesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  from: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    ),
  to: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    ),
  includeSpam: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional()
    .default(false),
})

export type SlugParam = z.infer<typeof slugParamSchema>
export type SubmitSurveyResponseInput = z.infer<typeof submitSurveyResponseSchema>
export type IdParam = z.infer<typeof idParamSchema>
export type ListResponsesQuery = z.infer<typeof listResponsesQuerySchema>
