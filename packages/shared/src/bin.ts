import { z } from 'zod'

/**
 * Казахстанский БИН — 12 цифр с контрольным разрядом по алгоритму,
 * общему с ИИН. Проверка помимо формата отлавливает большинство
 * «пальцем промахнулся» ошибок ввода.
 *
 * Алгоритм (РК-стандарт):
 *   1. d0..d10 × w1 = [1,2,3,4,5,6,7,8,9,10,11], остаток от 11
 *   2. Если остаток == 10 → повтор с w2 = [3,4,5,6,7,8,9,10,11,1,2]
 *   3. Если и второй остаток == 10 → БИН невалиден
 *   4. Иначе check-digit == остаток и должен совпасть с d11
 *
 * Полную бизнес-проверку (что БИН реально зарегистрирован в РК)
 * делает интеграция с adata.kz / stat.gov.kz — в backlog.
 */
export function isValidKzBin(raw: string): boolean {
  if (!/^[0-9]{12}$/.test(raw)) return false

  const digits = Array.from(raw, (c) => Number.parseInt(c, 10))
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const
  const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2] as const

  const weightedSum = (weights: readonly number[]): number =>
    weights.reduce((acc, w, i) => acc + (digits[i] ?? 0) * w, 0)

  let check = weightedSum(w1) % 11
  if (check === 10) {
    check = weightedSum(w2) % 11
    if (check === 10) return false
  }

  return check === digits[11]
}

export const binSchema = z
  .string()
  .trim()
  .refine(isValidKzBin, { message: 'Invalid Kazakhstani BIN' })
