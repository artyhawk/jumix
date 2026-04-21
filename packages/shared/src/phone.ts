import { parsePhoneNumberWithError } from 'libphonenumber-js'
import { z } from 'zod'

/**
 * Канонический формат телефона в БД — E.164 для Казахстана (`+7XXXXXXXXXX`).
 * DB check-constraint `users_phone_format_chk` требует ровно этот формат
 * (§6.1 CLAUDE.md). Все входы нормализуются тут — service-слой видит уже
 * готовую строку.
 *
 * libphonenumber-js (full variant) корректно разбирает все варианты KZ-ввода:
 *   "+7 (701) 000-11-22"  → "+77010001122"
 *   "8 701 000 11 22"     → "+77010001122"
 *   "7010001122"          → "+77010001122" (без кода страны, defaultCountry=KZ)
 *   "77010001122"         → "+77010001122"
 *
 * Возвращает null для невалидных входов: пустая строка, не KZ-номер,
 * landline, служебные коды, мусор.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  try {
    const parsed = parsePhoneNumberWithError(trimmed, 'KZ')
    if (!parsed.isValid()) return null
    if (parsed.country !== 'KZ') return null
    const e164 = parsed.number
    // DB-констрейнт `^\+7[0-9]{10}$` — страховка от экзотических форматов.
    if (!/^\+7[0-9]{10}$/.test(e164)) return null
    return e164
  } catch {
    return null
  }
}

/**
 * Shortcut: нормализует и возвращает успех. Удобно в guard-проверках
 * где сам нормализованный номер не нужен.
 */
export function isValidKzPhone(raw: string): boolean {
  return normalizePhone(raw) !== null
}

/**
 * Маскирует телефон для отображения в API-ответах и логах:
 *   "+77010001122" → "+7******1122"
 *
 * Оставляем префикс (+7) и 4 последних цифры — этого достаточно чтобы
 * пользователь узнал свой номер, но enumeration-атака через 409 conflict
 * responses становится бесполезной (нужно угадать 6 цифр).
 *
 * Полный номер — только в audit_log (internal) и в SMS-провайдере.
 */
export function maskPhone(phone: string): string {
  if (!/^\+7[0-9]{10}$/.test(phone)) return phone
  return `${phone.slice(0, 2)}******${phone.slice(-4)}`
}

/**
 * Zod-схема для request-body'ей с phone полем. Прогоняет через нормализацию
 * и блокирует невалидные форматы на границе API (до service-слоя).
 *
 * Output type — `string` в E.164. Input type — `string` свободной формы.
 */
export const phoneSchema = z
  .string()
  .min(1)
  .max(32)
  .transform((value, ctx) => {
    const normalized = normalizePhone(value)
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid Kazakhstani phone number',
      })
      return z.NEVER
    }
    return normalized
  })
