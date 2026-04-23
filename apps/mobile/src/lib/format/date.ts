import { pluralRu } from '@jumix/shared'

const DAY_FORMS = ['день', 'дня', 'дней'] as const

/**
 * `12 апреля 2027` — без weekday, для metadata и expiry dates.
 * Accepts ISO string or Date. Использует Intl.DateTimeFormat 'ru-RU' —
 * доступно в Hermes (iOS/Android) + react-native-web (vitest).
 */
export function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/**
 * Days between (expires - now), floored to day precision. Negative если
 * expiry в прошлом. Часы/минуты игнорируются — защита от краевых случаев
 * когда два раза вывели «через 0 дней» в один и тот же календарный день.
 */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return 0
  const MS_DAY = 24 * 60 * 60 * 1000
  const targetDay = Math.floor(target.getTime() / MS_DAY)
  const nowDay = Math.floor(now.getTime() / MS_DAY)
  return targetDay - nowDay
}

export type ExpiryTone = 'ok' | 'warning' | 'danger' | 'neutral'

export interface ExpiryCountdown {
  /** Human-readable строка: «Через 14 дней» / «Просрочено 3 дня назад» / «Не загружено». */
  text: string
  tone: ExpiryTone
  /** Signed days (negative = истекло; null = нет expiry). */
  days: number | null
}

/**
 * Formats expiry countdown с tone-coded color hint.
 *   null → {tone: 'neutral', text: 'Не загружено'}
 *   expired → {tone: 'danger', text: 'Просрочено N дней назад'}
 *   ≤ 30 дней → {tone: 'warning', text: 'Через N дней'}
 *   > 30 → {tone: 'ok', text: 'Через N дней'}
 *   === 0 → {tone: 'danger', text: 'Истекает сегодня'}
 */
export function formatExpiryCountdown(
  expiresAt: string | null,
  now: Date = new Date(),
): ExpiryCountdown {
  if (!expiresAt) {
    return { text: 'Не загружено', tone: 'neutral', days: null }
  }
  const diff = daysUntil(expiresAt, now)
  if (diff < 0) {
    const abs = Math.abs(diff)
    return {
      text: `Просрочено ${abs} ${pluralRu(abs, DAY_FORMS)} назад`,
      tone: 'danger',
      days: diff,
    }
  }
  if (diff === 0) {
    return { text: 'Истекает сегодня', tone: 'danger', days: 0 }
  }
  return {
    text: `Через ${diff} ${pluralRu(diff, DAY_FORMS)}`,
    tone: diff <= 30 ? 'warning' : 'ok',
    days: diff,
  }
}
