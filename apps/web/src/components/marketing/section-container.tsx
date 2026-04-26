import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/**
 * Marketing section wrapper. Generous vertical rhythm на desktop, sane на phone.
 * Variants: default (full-width edges), narrow (text-heavy), bare (без padding для hero).
 */
export function SectionContainer({
  id,
  children,
  variant = 'default',
  className,
  as: Tag = 'section',
}: {
  id?: string
  children: ReactNode
  variant?: 'default' | 'narrow' | 'bare'
  className?: string
  as?: 'section' | 'div'
}) {
  return (
    <Tag
      id={id}
      className={cn(
        variant !== 'bare' && 'px-5 md:px-8',
        variant === 'default' && 'py-20 md:py-32',
        variant === 'narrow' && 'py-16 md:py-24',
        className,
      )}
    >
      <div
        className={cn(
          'mx-auto',
          variant === 'narrow' ? 'max-w-3xl' : 'max-w-7xl',
          variant === 'bare' && 'max-w-none',
        )}
      >
        {children}
      </div>
    </Tag>
  )
}
