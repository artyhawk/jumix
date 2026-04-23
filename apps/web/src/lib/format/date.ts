export function formatRuLongDate(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
  return fmt.charAt(0).toUpperCase() + fmt.slice(1)
}

/**
 * `12 апреля 2027` — без weekday, для metadata и expiry dates.
 * Accepts ISO string or Date.
 */
export function formatRuDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/**
 * Days between (expires - today), floored. Negative if expired.
 * Only day-precision — hours/minutes ignored.
 */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return 0
  const MS_DAY = 24 * 60 * 60 * 1000
  const targetDay = Math.floor(target.getTime() / MS_DAY)
  const nowDay = Math.floor(now.getTime() / MS_DAY)
  return targetDay - nowDay
}
