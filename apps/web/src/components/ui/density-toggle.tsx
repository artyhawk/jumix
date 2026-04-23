'use client'

import { useDensity } from '@/lib/hooks/use-density'
import { cn } from '@/lib/utils'
import { Rows3, Rows4 } from 'lucide-react'

interface Props {
  className?: string
}

/**
 * Global density toggle (B3-UI-5a). Compact ↔ default через
 * `useDensity`, persist'ится в localStorage, применяется ко всем
 * DataTable instances сразу.
 *
 * Размещается в PageHeader.action или отдельно в topbar. Mobile behavior:
 * показывается везде, но density на mobile cards не влияет (cards всегда
 * comfortable-spacing). Toggle актуален только на desktop.
 */
export function DensityToggle({ className }: Props) {
  const { density, toggle } = useDensity()
  const isCompact = density === 'compact'
  const label = isCompact
    ? 'Компактный вид · переключить на обычный'
    : 'Обычный вид · переключить на компактный'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center gap-1.5',
        'size-9 rounded-[10px] border border-border-default bg-layer-2',
        'text-text-secondary hover:text-text-primary hover:bg-layer-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
        'transition-colors duration-150',
        className,
      )}
    >
      {isCompact ? (
        <Rows4 className="size-4" strokeWidth={1.5} aria-hidden />
      ) : (
        <Rows3 className="size-4" strokeWidth={1.5} aria-hidden />
      )}
    </button>
  )
}
