'use client'

import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

/**
 * Базовый input. Mobile-first — min 44px высота для touch. На ≥md — 40px (default).
 * Focus ring через animated CSS (framer-motion тут overkill для каждого input).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full min-h-[44px] md:min-h-0 md:h-10 px-3 rounded-[10px]',
        'bg-layer-1 border text-sm text-text-primary',
        'placeholder:text-text-tertiary',
        'transition-colors duration-150',
        'focus:outline-none',
        invalid
          ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/40'
          : 'border-border-default focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  )
})
