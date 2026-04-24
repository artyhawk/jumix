/**
 * Форматирование duration в HH:MM:SS или MM:SS (если < 1 часа).
 * Используется для active shift timer (M4).
 */
export function formatDuration(seconds: number): string {
  const nonneg = Math.max(0, Math.floor(seconds))
  const h = Math.floor(nonneg / 3600)
  const m = Math.floor((nonneg % 3600) / 60)
  const s = nonneg % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${mm}:${ss}`
  return `${mm}:${ss}`
}

/** Human-readable time HH:MM из ISO string в local timezone. */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}
