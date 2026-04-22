'use client'

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { RecentAuditEvent } from '@/lib/api/types'
import { formatActionLabel, getActionIcon } from '@/lib/format/audit'
import { formatRelativeTime } from '@/lib/format/time'
import { useRecentAudit } from '@/lib/hooks/use-audit'
import { cn } from '@/lib/utils'
import { AlertCircle, Inbox } from 'lucide-react'

/**
 * Timeline-style feed последних платформенных событий. Fetches top-20 из
 * /api/v1/audit/recent (superadmin-only). Rendered в dashboard grid (2-col
 * на lg+, stacked на <lg).
 */
export function RecentActivity() {
  const query = useRecentAudit(20)
  const events = query.data?.events ?? []

  return (
    <Card variant="default" className="flex flex-col p-0 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <h2 className="text-base font-semibold text-text-primary">Последние события</h2>
        {query.data ? (
          <span className="text-xs text-text-tertiary tabular-nums">{events.length}</span>
        ) : null}
      </header>

      <div className="flex-1 max-h-[480px] overflow-y-auto">
        {query.isLoading ? (
          <ActivitySkeleton />
        ) : query.isError ? (
          <ActivityError onRetry={() => query.refetch()} />
        ) : events.length === 0 ? (
          <ActivityEmpty />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {events.map((event) => (
              <ActivityRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function ActivityRow({ event }: { event: RecentAuditEvent }) {
  const { icon: Icon, accent } = getActionIcon(event.action)
  const label = formatActionLabel(event)
  const actorName = event.actor.name ?? 'Система'

  return (
    <li className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-layer-3/40">
      <span
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-full border',
          accent === 'success' && 'bg-success/10 border-success/20 text-success',
          accent === 'danger' && 'bg-danger/10 border-danger/20 text-danger',
          accent === 'warning' && 'bg-warning/10 border-warning/20 text-warning',
          accent === 'neutral' && 'bg-layer-3 border-border-subtle text-text-secondary',
        )}
      >
        <Icon className="size-4" strokeWidth={1.5} aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary">{label}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-tertiary">
          <span className="truncate">{actorName}</span>
          {event.organizationName ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{event.organizationName}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <time dateTime={event.createdAt}>{formatRelativeTime(event.createdAt)}</time>
        </div>
      </div>
    </li>
  )
}

function ActivitySkeleton() {
  return (
    <ul className="divide-y divide-border-subtle">
      {['s1', 's2', 's3', 's4', 's5'].map((k) => (
        <li key={k} className="flex items-start gap-3 px-4 py-3">
          <Skeleton className="size-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 py-0.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ActivityEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="inline-flex items-center justify-center size-12 rounded-full bg-layer-3 border border-border-subtle">
        <Inbox className="size-5 text-text-tertiary" strokeWidth={1.5} aria-hidden />
      </div>
      <p className="text-sm text-text-secondary">Пока нет событий</p>
    </div>
  )
}

function ActivityError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="inline-flex items-center justify-center size-12 rounded-full bg-danger/10 border border-danger/20">
        <AlertCircle className="size-5 text-danger" strokeWidth={1.5} aria-hidden />
      </div>
      <p className="text-sm text-text-secondary">Не удалось загрузить</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded"
      >
        Повторить
      </button>
    </div>
  )
}
