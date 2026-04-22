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
  // Вытаскиваем только цифры
  let onlyDigits = raw.replace(/\D/g, '')
  // Срезаем национальный префикс ТОЛЬКО когда вход явно содержит 11 цифр,
  // начинающихся с 7/8 (полный +7XXXXXXXXXX или казахское 8XXXXXXXXXX).
  // При живом вводе 10 цифр (701...) первая цифра — часть кода оператора,
  // удалять её нельзя — иначе теряем символ при последовательном typing'е.
  if (onlyDigits.length === 11 && (onlyDigits.startsWith('7') || onlyDigits.startsWith('8'))) {
    onlyDigits = onlyDigits.slice(1)
  } else if (onlyDigits.length > 11 && (onlyDigits.startsWith('7') || onlyDigits.startsWith('8'))) {
    // Длиннее 11 — paste с лишним мусором, обрезаем префикс и truncate'им.
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
