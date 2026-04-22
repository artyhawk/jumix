import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface DetailRowProps {
  label: string
  children: ReactNode
  className?: string
  mono?: boolean
}

/**
 * Строка label/value в detail-drawer'е. Mobile: stacked, desktop: row.
 */
export function DetailRow({ label, children, className, mono }: DetailRowProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 md:flex-row md:items-baseline md:gap-4 py-2 border-b border-border-subtle last:border-0',
        className,
      )}
    >
      <dt className="shrink-0 md:w-36 text-xs uppercase tracking-wider text-text-tertiary">
        {label}
      </dt>
      <dd
        className={cn('flex-1 min-w-0 text-sm text-text-primary', mono ? 'font-mono-numbers' : '')}
      >
        {children}
      </dd>
    </div>
  )
}
