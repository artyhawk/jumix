import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/**
 * Feature card: icon + title + description. Hover lift + subtle gradient border (m-card-glow).
 * Server component — interactivity полностью CSS.
 */
export function FeatureCard({
  icon,
  title,
  description,
  className,
  tone = 'default',
}: {
  icon?: ReactNode
  title: string
  description: string
  className?: string
  tone?: 'default' | 'danger'
}) {
  return (
    <div className={cn('m-card m-card-glow p-6 md:p-7 h-full flex flex-col gap-4', className)}>
      {icon ? (
        <div
          className={cn(
            'inline-flex size-11 items-center justify-center rounded-[12px] shrink-0',
            tone === 'default'
              ? 'bg-[color:var(--m-brand-glow)] text-[var(--m-brand)]'
              : 'bg-red-500/10 text-red-400',
          )}
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <div className="space-y-2">
        <h3 className="text-[17px] font-semibold leading-snug text-[var(--m-fg)]">{title}</h3>
        <p className="text-sm text-[var(--m-fg-secondary)] leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
