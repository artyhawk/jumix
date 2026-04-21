import { z } from 'zod'

/**
 * Нормализует казахстанский номер телефона в канонический формат `+7XXXXXXXXXX`.
 *
 * Принимает любые разумные варианты пользовательского ввода:
 *   "+7 (701) 000-11-22"  → "+77010001122"
 *   "8 701 000 11 22"     → "+77010001122"
 *   "7010001122"          → "+77010001122" (короткая запись без кода страны)
 *
 * Возвращает null если строка не сводится к валидному KZ-номеру. Формат
 * синхронизирован с check-constraint `users_phone_format_chk` (§6.1 CLAUDE.md)
 * и с валидаторами в мобилке.
 */
export function normalizeKzPhone(raw: string): string | null {
  const digits = raw.replace(/\D+/g, '')
  if (digits.length === 0) return null

  // Отрезаем код страны, оставляем 10 цифр местного номера.
  let local: string | null = null
  if (digits.length === 10) {
    local = digits
  } else if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    local = digits.slice(1)
  }
  if (!local) return null
  if (!/^[0-9]{10}$/.test(local)) return null
  // KZ mobile prefix: 7xx, 6xx. Узкую проверку не делаем — sql-check уже
  // ограничивает формат; минимум — первая цифра local не ноль.
  if (local.startsWith('0')) return null

  return `+7${local}`
}

/**
 * Zod-схема для request-body'ей с phone полем. Прогоняет через нормализацию
 * и блокирует невалидные форматы на границе API (до service-слоя).
 */
export const phoneSchema = z
  .string()
  .min(1)
  .max(32)
  .transform((value, ctx) => {
    const normalized = normalizeKzPhone(value)
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid Kazakhstani phone number',
      })
      return z.NEVER
    }
    return normalized
  })
