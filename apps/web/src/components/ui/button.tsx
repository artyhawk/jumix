'use client'

import { cn } from '@/lib/utils'
import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import { motion } from 'framer-motion'
import { forwardRef } from 'react'

/**
 * Mobile-first: базовый `min-h-[44px]` соответствует Apple HIG / Material touch target.
 * На `md:` возвращаемся к design-system размерам (32/36/40).
 * Spring на press — НЕ scale 0.95 (выглядит toggle-ишно), а 0.98.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px]',
    'font-medium text-sm',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-layer-0',
    'disabled:opacity-40 disabled:pointer-events-none',
    'select-none',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-brand-500 text-brand-foreground hover:bg-brand-400 active:bg-brand-600 shadow-[0_1px_0_rgba(0,0,0,0.4)]',
        secondary:
          'bg-layer-3 text-text-primary border border-border-default hover:bg-layer-4 hover:border-border-strong',
        ghost: 'text-text-secondary hover:text-text-primary hover:bg-layer-2',
        danger: 'bg-danger/90 text-white hover:bg-danger',
        subtle:
          'bg-layer-2 text-text-primary border border-border-subtle hover:border-border-default hover:bg-layer-3',
      },
      size: {
        sm: 'min-h-[44px] md:min-h-0 md:h-8 px-3 text-[13px]',
        md: 'min-h-[44px] md:min-h-0 md:h-9 px-4',
        lg: 'min-h-[44px] md:min-h-0 md:h-10 px-5',
        icon: 'min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:h-9 md:w-9',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      block: false,
    },
  },
)

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  disabled?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, loading, disabled, children, ...props },
  ref,
) {
  const isDisabled = disabled || loading
  const classes = cn(buttonVariants({ variant, size, block }), className)

  if (asChild) {
    return (
      <Slot
        ref={ref}
        className={classes}
        aria-busy={loading || undefined}
        {...(props as React.HTMLAttributes<HTMLElement>)}
      >
        {loading ? <LoadingDots /> : children}
      </Slot>
    )
  }

  const {
    onDrag: _onDrag,
    onDragEnd: _onDragEnd,
    onDragStart: _onDragStart,
    onAnimationStart: _onAnimationStart,
    onAnimationEnd: _onAnimationEnd,
    onAnimationIteration: _onAnimationIteration,
    ...motionSafeProps
  } = props

  return (
    <motion.button
      ref={ref}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      whileTap={isDisabled ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      {...motionSafeProps}
    >
      {loading ? <LoadingDots /> : children}
    </motion.button>
  )
})

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block size-1.5 rounded-full bg-current"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            repeat: Number.POSITIVE_INFINITY,
            duration: 1.1,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </span>
  )
}

export { buttonVariants }
