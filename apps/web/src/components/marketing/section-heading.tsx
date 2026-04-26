import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/**
 * Three-part heading: overline (small uppercase) + h2 + subtitle. Centered or left-aligned.
 */
export function SectionHeading({
  overline,
  title,
  subtitle,
  align = 'center',
  className,
  children,
}: {
  overline?: string
  title: string
  subtitle?: string
  align?: 'center' | 'left'
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        align === 'center' && 'mx-auto max-w-2xl',
        className,
      )}
    >
      {overline ? (
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--m-brand)]">
          <span className="size-1 rounded-full bg-[var(--m-brand)]" aria-hidden />
          {overline}
        </span>
      ) : null}
      <h2
        className="font-semibold tracking-tight m-text-balance"
        style={{
          fontSize: 'clamp(1.75rem, 2vw + 1.25rem, 3rem)',
          lineHeight: 1.1,
          color: 'var(--m-fg)',
        }}
      >
        {title}
      </h2>
      {subtitle ? (
        <p
          className="text-[15px] md:text-base text-[var(--m-fg-secondary)] leading-relaxed m-text-balance"
          style={{ maxWidth: align === 'center' ? '36rem' : undefined }}
        >
          {subtitle}
        </p>
      ) : null}
      {children}
    </div>
  )
}
