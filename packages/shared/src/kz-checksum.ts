/**
 * Проверка контрольного разряда 12-значных идентификаторов РК
 * (БИН для юрлиц, ИИН для физлиц) — единый алгоритм на уровне стандарта.
 *
 * Алгоритм:
 *   1. d0..d10 × w1 = [1,2,3,4,5,6,7,8,9,10,11], остаток от 11
 *   2. Если остаток == 10 → повтор с w2 = [3,4,5,6,7,8,9,10,11,1,2]
 *   3. Если и второй остаток == 10 → идентификатор невалиден
 *   4. Иначе check-digit == остаток и должен совпасть с d11
 *
 * Полная бизнес-проверка (что идентификатор реально зарегистрирован в РК)
 * делается через внешние реестры — в backlog.
 */
export function validateKz12DigitChecksum(raw: string): boolean {
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
