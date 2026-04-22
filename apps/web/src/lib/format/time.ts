/**
 * Relative time formatter для metadata ("2 дн назад"). Никаких бандлов
 * вроде `date-fns` — простой кусок логики на MVP, i18n сейчас только ru.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  if (ms < 0) return 'только что'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} дн назад`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks} нед назад`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} мес назад`
  const years = Math.floor(days / 365)
  return `${years} г назад`
}
