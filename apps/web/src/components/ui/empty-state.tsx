import { cn } from '@/lib/utils'
import type { IconCrane } from '@tabler/icons-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Icon может быть lucide OR tabler — shape compatible (принимают className,
 * strokeWidth, size). Тот же тип, что в CommandEntry (registry.ts).
 */
export type EmptyStateIcon = LucideIcon | typeof IconCrane

export interface EmptyStateProps {
  icon: EmptyStateIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  /** Visual tone — success (hires queue clear), neutral (default), danger (error). */
  tone?: 'neutral' | 'success' | 'danger'
}

/**
 * Unified empty state primitive (B3-UI-5a). Заменяет ad-hoc text-only blocks
 * по всему web cabinet. Layout: blurred radial glow под icon + bordered
 * circle + title + optional description + optional action.
 *
 * Brand-orange появляется ТОЛЬКО в glow (≤ 5% surface area rule — §8.5
 * design system). Icon — text-secondary. Danger/success tone меняют glow
 * color но не icon.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  tone = 'neutral',
}: EmptyStateProps) {
  const glowClass =
    tone === 'success' ? 'bg-success/15' : tone === 'danger' ? 'bg-danger/15' : 'bg-brand-500/10'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 py-12 px-4 text-center',
        className,
      )}
    >
      <div className="relative">
        <div aria-hidden className={cn('absolute inset-0 rounded-full blur-2xl', glowClass)} />
        <div className="relative inline-flex size-16 items-center justify-center rounded-full border border-border-default bg-layer-3">
          <Icon className="size-7 text-text-secondary" strokeWidth={1.5} aria-hidden />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        {description ? <p className="max-w-sm text-sm text-text-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
