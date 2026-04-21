import { MIN_PASSWORD_LENGTH } from '@jumix/auth'
import { z } from 'zod'
import { phoneSchema } from '../../../lib/phone'

/**
 * POST /auth/login. Phone + password. clientKind разрешён из body но
 * дублируется server-side heuristic по User-Agent (см. TokenIssuerService).
 * deviceId — optional, используется для device management / marketplace trust.
 */
export const loginSchema = z.object({
  phone: phoneSchema,
  // Не валидируем длину входящего пароля: при коротком значении возвращаем
  // общий INVALID_CREDENTIALS (чтобы не раскрывать политики паролей).
  password: z.string().min(1).max(200),
  clientKind: z.enum(['web', 'mobile']).default('web'),
  deviceId: z.string().max(128).optional(),
})
export type LoginBody = z.infer<typeof loginSchema>

/** POST /auth/password-reset/request. Только phone. */
export const passwordResetRequestSchema = z.object({
  phone: phoneSchema,
})
export type PasswordResetRequestBody = z.infer<typeof passwordResetRequestSchema>

/**
 * POST /auth/password-reset/confirm. Код 6 digits (доставлен SMS'ом),
 * новый пароль не короче MIN_PASSWORD_LENGTH (§5.3, OWASP).
 *
 * zxcvbn-check не применяем тут: он cpu-bound и его лучше гонять на клиенте
 * в момент ввода; финальный guard — MIN_PASSWORD_LENGTH.
 */
export const passwordResetConfirmSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^[0-9]{6}$/, 'Code must be 6 digits'),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
})
export type PasswordResetConfirmBody = z.infer<typeof passwordResetConfirmSchema>
