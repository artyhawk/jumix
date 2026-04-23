import { isValidKzPhone, normalizePhone } from '@jumix/shared'

/**
 * Mobile-specific phone utilities. Backend validation reused from
 * `@jumix/shared` — monorepo zero-duplication principle (M1 Решение 1).
 *
 * Formatting functions here обслуживают UX: mask `(XXX) XXX-XX-XX`
 * с locked `+7` prefix. Backend принимает любой KZ формат и нормализует
 * в E.164, но mobile UI выдаёт canonical формат в placeholder.
 */

const MASK_PLACES = 10 // количество цифр после +7 (XXX XXX XX XX)

/**
 * Возвращает только цифры телефона БЕЗ leading `7`. Input `"+77010001122"`
 * → `"7010001122"` (10 digits). Для short input возвращает то что есть.
 */
export function phoneDigits(raw: string): string {
  // Удаляем всё кроме цифр
  const digits = raw.replace(/\D/g, '')
  // Strip leading 7 или 8 если длина ≥ 11 (иначе ломаем sequential typing)
  if (digits.length >= 11 && (digits[0] === '7' || digits[0] === '8')) {
    return digits.slice(1, 1 + MASK_PLACES)
  }
  return digits.slice(0, MASK_PLACES)
}

/**
 * Formats 10-digit phone tail в `(XXX) XXX-XX-XX` (Kazakhstani convention).
 * Partial input — фрагментарно (сохраняет сoursor-friendly поведение).
 */
export function formatPhoneMask(digits: string): string {
  const trimmed = digits.slice(0, MASK_PLACES)
  const len = trimmed.length
  if (len === 0) return ''
  if (len <= 3) return `(${trimmed}`
  if (len <= 6) return `(${trimmed.slice(0, 3)}) ${trimmed.slice(3)}`
  if (len <= 8) return `(${trimmed.slice(0, 3)}) ${trimmed.slice(3, 6)}-${trimmed.slice(6)}`
  return `(${trimmed.slice(0, 3)}) ${trimmed.slice(3, 6)}-${trimmed.slice(6, 8)}-${trimmed.slice(8)}`
}

/**
 * Full E.164 representation: `+77010001122`. Undefined если не хватает
 * цифр для полного номера.
 */
export function toE164(digits: string): string | undefined {
  if (digits.length !== MASK_PLACES) return undefined
  return `+7${digits}`
}

export { isValidKzPhone, normalizePhone }
