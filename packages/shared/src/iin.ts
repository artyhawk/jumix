import { z } from 'zod'
import { validateKz12DigitChecksum } from './kz-checksum'

/**
 * Казахстанский ИИН — 12 цифр с контрольным разрядом по общему для БИН/ИИН
 * алгоритму РК. Формат: 6 цифр даты рождения (YYMMDD) + 1 цифра век/пол
 * + 4 цифры порядкового номера + 1 контрольный разряд.
 *
 * Здесь проверяется только формат и checksum. Валидация вложенной даты
 * рождения и пола в цифре 7 — вне MVP (слишком много edge cases вокруг
 * иностранцев с ИИН, исторических записей и т.д.).
 *
 * Алгоритм checksum — см. validateKz12DigitChecksum.
 */
export function isValidKzIin(raw: string): boolean {
  return validateKz12DigitChecksum(raw)
}

export const iinSchema = z
  .string()
  .trim()
  .length(12, { message: 'ИИН должен содержать 12 цифр' })
  .regex(/^[0-9]+$/, { message: 'ИИН должен содержать только цифры' })
  .refine(isValidKzIin, { message: 'Invalid Kazakhstani IIN' })
