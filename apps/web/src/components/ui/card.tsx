import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'interactive'
}

/**
 * Card — base surface (Layer 2). Hover только когда variant='interactive'
 * (в списках, dashboard'ах). Для статического контента — без hover state.
 * Никаких transform scale — только border/bg transitions.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = 'default', ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-[12px] border bg-layer-2',
        'p-4 md:p-5',
        variant === 'default' && 'border-border-subtle',
        variant === 'elevated' && 'border-border-default bg-layer-3 shadow-lg shadow-black/20',
        variant === 'interactive' &&
          'border-border-subtle transition-colors duration-200 hover:border-border-default cursor-pointer',
        className,
      )}
      {...props}
    />
  )
})

export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn('flex flex-col gap-1.5 pb-4', className)} {...props} />
  },
)

export const CardTitle = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('text-[18px] leading-7 font-semibold text-text-primary', className)}
        {...props}
      />
    )
  },
)

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('text-sm text-text-secondary', className)} {...props} />
})

export const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('', className)} {...props} />
  },
)

export const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex items-center pt-4 border-t border-border-subtle mt-4', className)}
        {...props}
      />
    )
  },
)
