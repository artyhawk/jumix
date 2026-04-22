import { z } from 'zod'
import { validateKz12DigitChecksum } from './kz-checksum'

/**
 * Казахстанский БИН — 12 цифр с контрольным разрядом по общему для БИН/ИИН
 * алгоритму РК. Проверка помимо формата отлавливает большинство
 * «пальцем промахнулся» ошибок ввода.
 *
 * Алгоритм — см. validateKz12DigitChecksum в kz-checksum.ts.
 */
export function isValidKzBin(raw: string): boolean {
  return validateKz12DigitChecksum(raw)
}

export const binSchema = z
  .string()
  .trim()
  .refine(isValidKzBin, { message: 'Invalid Kazakhstani BIN' })
