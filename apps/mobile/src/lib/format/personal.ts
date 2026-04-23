/**
 * Initials для Avatar placeholder. Берём первую букву фамилии + первую имени.
 * Если оба пустые → '?' (не ломаем layout).
 */
export function getInitials(profile: { firstName: string; lastName: string }): string {
  const last = profile.lastName.trim()[0] ?? ''
  const first = profile.firstName.trim()[0] ?? ''
  const combined = `${last}${first}`.toUpperCase()
  return combined.length > 0 ? combined : '?'
}

/**
 * Полное ФИО в русском порядке: Фамилия Имя Отчество. Пропускает пустые
 * компоненты (напр. patronymic=null).
 */
export function getFullName(profile: {
  firstName: string
  lastName: string
  patronymic: string | null
}): string {
  return [profile.lastName, profile.firstName, profile.patronymic]
    .filter((x): x is string => Boolean(x?.trim()))
    .join(' ')
}

/**
 * ИИН 12 цифр → `990101 300123` (6+6 split для читаемости).
 * Недопустимые/короткие строки возвращаются как есть (без падения).
 */
export function formatIin(iin: string): string {
  if (iin.length !== 12) return iin
  return `${iin.slice(0, 6)} ${iin.slice(6)}`
}

/**
 * E.164 `+77001234567` → `+7 700 123 45 67`. Для любых других форматов
 * возвращаем строку без изменений (не рискуем рассечь не-KZ номер).
 */
export function formatPhone(phone: string): string {
  if (!phone.startsWith('+7') || phone.length !== 12) return phone
  return `+7 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8, 10)} ${phone.slice(10)}`
}
