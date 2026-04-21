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
 * Инвариант: **что бы ни пришло на вход, в выводе открытыми остаются
 * максимум 4 последних символа.** Это fail-safe от утечки: если невалидный
 * телефон каким-то путём дотечёт до response (constraint violation с raw
 * message, hand-written logger, bypass Zod) — номер не уйдёт наружу.
 *
 * Правила (проверяются сверху вниз):
 *   - пусто → `"***"` (плейсхолдер)
 *   - длина ≤ 4 → `"****"` (целиком скрываем, длину не светим)
 *   - начинается с `+` и длина ≥ 8 → `+XX****YYYY` (E.164)
 *   - иначе → `"***" + last4` (короткий / мусорный вход)
 *
 * Полный номер — только в audit_log (internal) и в SMS-провайдере.
 */
export function maskPhone(phone: string): string {
  if (!phone) return '***'
  if (phone.length <= 4) return '****'
  if (phone.startsWith('+') && phone.length >= 8) {
    return `${phone.slice(0, 2)}${'*'.repeat(phone.length - 6)}${phone.slice(-4)}`
  }
  return `***${phone.slice(-4)}`
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
