'use client'

import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

interface Props {
  canWork: boolean
  reasons: string[]
  loading?: boolean
}

/**
 * Центральная status-card на /me (B3-UI-4). Semantic colors (success/danger) —
 * НЕ brand-orange; canWork indicator — критично обозначает работоспособность.
 *
 * loading — skeleton-shape чтобы grid не прыгал.
 */
export function MeStatusCard({ canWork, reasons, loading }: Props) {
  if (loading) {
    return (
      <div className="h-[120px] rounded-[12px] border border-border-subtle bg-layer-2 animate-[pulse_1.5s_ease-in-out_infinite]" />
    )
  }
  return (
    <div
      className={cn(
        'rounded-[12px] border p-5 md:p-6',
        canWork ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5',
      )}
    >
      <div className="flex items-start gap-4">
        {canWork ? (
          <CheckCircle2 className="size-10 shrink-0 text-success" strokeWidth={1.5} aria-hidden />
        ) : (
          <AlertCircle className="size-10 shrink-0 text-danger" strokeWidth={1.5} aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg md:text-xl font-semibold text-text-primary">
            {canWork ? 'Вы можете работать' : 'Работа заблокирована'}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {canWork
              ? 'Все необходимые условия выполнены'
              : 'Выполните условия ниже, чтобы начать работу'}
          </p>
        </div>
      </div>

      {!canWork && reasons.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2 text-sm text-text-secondary">
          {reasons.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <span aria-hidden className="mt-[6px] size-1.5 shrink-0 rounded-full bg-danger" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
