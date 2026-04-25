/**
 * Форматирование duration в HH:MM:SS или MM:SS (если < 1 часа) — для
 * детальных метрик смены (M5-c ShiftDrawer). Negative clamp → 0.
 *
 * Параллель с apps/mobile/src/lib/format/duration.ts — mobile поддерживает
 * live tick'ер (секунда-по-секунда), web — статическую duration. Hoist в
 * `@jumix/shared` при появлении третьего consumer'а (rule of three).
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

/** Rounded «Nч Mмин» — для hero-секции (drawer). */
export function formatDurationHuman(seconds: number): string {
  const nonneg = Math.max(0, Math.floor(seconds))
  const h = Math.floor(nonneg / 3600)
  const m = Math.floor((nonneg % 3600) / 60)
  if (h === 0 && m === 0) return 'меньше минуты'
  if (h === 0) return `${m} мин`
  if (m === 0) return `${h} ч`
  return `${h} ч ${m} мин`
}

/**
 * Вычисляет elapsed-секунды для смены: (endTs - startedAt) - totalPauseSeconds
 * - активный перерыв (если paused сейчас). Для ended смены endTs = endedAt.
 */
export function computeShiftDurationSeconds(
  shift: {
    startedAt: string
    endedAt: string | null
    pausedAt: string | null
    totalPauseSeconds: number
    status: 'active' | 'paused' | 'ended'
  },
  now: Date = new Date(),
): number {
  const started = new Date(shift.startedAt).getTime()
  const end = shift.endedAt ? new Date(shift.endedAt).getTime() : now.getTime()
  const pausedMs = shift.totalPauseSeconds * 1000
  const activePauseMs =
    shift.status === 'paused' && shift.pausedAt
      ? Math.max(0, now.getTime() - new Date(shift.pausedAt).getTime())
      : 0
  return Math.max(0, Math.floor((end - started - pausedMs - activePauseMs) / 1000))
}
