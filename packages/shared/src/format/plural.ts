/**
 * Russian plural form selector — выбирает из 3-form tuple на основе числа.
 *
 * Правила:
 *   - мод 100 от 11 до 14 → [2] (много / родительный)
 *   - мод 10 === 1 → [0] (единственное)
 *   - мод 10 от 2 до 4 → [1] (двойственное)
 *   - иначе → [2]
 *
 * Пример:
 *   pluralRu(1, ['день', 'дня', 'дней']) → 'день'
 *   pluralRu(3, ['день', 'дня', 'дней']) → 'дня'
 *   pluralRu(5, ['день', 'дня', 'дней']) → 'дней'
 *   pluralRu(11, ['день', 'дня', 'дней']) → 'дней'
 */
export function pluralRu(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const mod10 = abs % 10
  if (abs >= 11 && abs <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}
