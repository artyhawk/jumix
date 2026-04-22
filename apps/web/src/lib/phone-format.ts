/**
 * Форматирует E.164 KZ-номер для отображения: "+77010001122" → "+7 701 000 11 22".
 * Если вход невалиден — возвращается как есть.
 */
export function formatKzPhoneDisplay(e164: string): string {
  if (!/^\+7\d{10}$/.test(e164)) return e164
  const digits = e164.slice(2) // 10 цифр
  return `+7 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`
}

/**
 * Маска для живого ввода. Пользователь печатает только цифры, мы отображаем
 * "+7 XXX XXX XX XX". Возвращает пару (форматированная строка, raw digits ≤ 10).
 *
 * Принимает произвольный ввод (с цифрами и non-digits), вытягивает цифры,
 * обрезает до 10 штук после KZ префикса 7/8 (оба приводим к одному набору).
 */
export function applyPhoneMask(raw: string): { formatted: string; digits: string } {
  // Маска всегда рендерит литерал "+7 …", поэтому при live-typing input.value
  // уже содержит "+7" перед тем, что пользователь реально печатает. Срезаем
  // этот префикс ДО извлечения digits — иначе "7" из "+7" попадает в digits
  // и сдвигает ввод (пользователь печатает "0", получает "+7 70").
  const stripped = raw.startsWith('+7') ? raw.slice(2) : raw
  let onlyDigits = stripped.replace(/\D/g, '')
  // Paste полной 11-значной национальной формы ("77010001122" / "87010001122")
  // — срезаем ведущий префикс. Не трогаем 10-значный ввод без префикса.
  if (onlyDigits.length >= 11 && (onlyDigits.startsWith('7') || onlyDigits.startsWith('8'))) {
    onlyDigits = onlyDigits.slice(1)
  }
  const digits = onlyDigits.slice(0, 10)

  // Форматируем
  let formatted = '+7'
  if (digits.length > 0) formatted += ` ${digits.slice(0, 3)}`
  if (digits.length > 3) formatted += ` ${digits.slice(3, 6)}`
  if (digits.length > 6) formatted += ` ${digits.slice(6, 8)}`
  if (digits.length > 8) formatted += ` ${digits.slice(8, 10)}`

  return { formatted, digits }
}

/**
 * Собирает E.164 из 10 цифр: "7010001122" → "+77010001122".
 * Ожидает ровно 10 digit'ов, иначе возвращает null.
 */
export function toE164(digits: string): string | null {
  if (!/^\d{10}$/.test(digits)) return null
  return `+7${digits}`
}
