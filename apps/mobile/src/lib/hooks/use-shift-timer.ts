import type { ShiftWithRelations } from '@jumix/shared'
import { useEffect, useState } from 'react'

/**
 * Live elapsed-time счётчик для active shift. Client-computed:
 *   elapsedMs = (now - startedAt) - totalPauseSeconds*1000 - currentPauseMs
 * где currentPauseMs = `now - pausedAt` если status='paused'.
 *
 * Tick interval 1s — визуальный счётчик, не timing-sensitive. Backend
 * refetch'ает shift каждые 30s (useMyActiveShift polling) — это корректирует
 * drift клиентских часов.
 *
 * Возвращает elapsed в секундах. Для ended shift возвращает фиксированное
 * значение (ended_at - started_at - totalPauseSeconds).
 */
export function useShiftTimer(shift: ShiftWithRelations | null | undefined): number {
  const [elapsed, setElapsed] = useState(() => computeElapsed(shift, Date.now()))

  useEffect(() => {
    // Ended shift — static value, нет смысла тикать.
    if (!shift || shift.status === 'ended') {
      setElapsed(computeElapsed(shift, Date.now()))
      return
    }
    setElapsed(computeElapsed(shift, Date.now()))
    const id = setInterval(() => {
      setElapsed(computeElapsed(shift, Date.now()))
    }, 1000)
    return () => clearInterval(id)
  }, [shift])

  return elapsed
}

export function computeElapsed(
  shift: ShiftWithRelations | null | undefined,
  nowMs: number,
): number {
  if (!shift) return 0
  const started = new Date(shift.startedAt).getTime()
  if (Number.isNaN(started)) return 0

  const endMs =
    shift.status === 'ended' && shift.endedAt ? new Date(shift.endedAt).getTime() : nowMs
  let elapsedMs = endMs - started
  elapsedMs -= shift.totalPauseSeconds * 1000

  // Текущая pause (для paused status) — её длительность ещё не в totalPauseSeconds.
  if (shift.status === 'paused' && shift.pausedAt) {
    const pauseStart = new Date(shift.pausedAt).getTime()
    if (!Number.isNaN(pauseStart)) {
      elapsedMs -= nowMs - pauseStart
    }
  }

  return Math.max(0, Math.floor(elapsedMs / 1000))
}
