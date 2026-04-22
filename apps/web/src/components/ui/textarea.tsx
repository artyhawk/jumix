'use client'

import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

/**
 * Матчится по стилю с `Input` — same radii, colors, focus-ring. Минимум 88px
 * высоты (3 ряда по 14px + padding), без resize — высота фиксированная через
 * `rows` prop.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full min-h-[88px] rounded-[10px] px-3 py-2',
        'bg-layer-1 border text-sm text-text-primary',
        'placeholder:text-text-tertiary',
        'transition-colors duration-150',
        'focus:outline-none',
        invalid
          ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/40'
          : 'border-border-default focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'resize-none font-sans',
        className,
      )}
      {...props}
    />
  )
})
