import { cn } from '@/lib/utils'

/**
 * Skeleton с shimmer-анимацией (brand-500 5% opacity slide 1.8s).
 * Используется вместо spinner'ов — даёт больше signal о будущей форме контента.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-label="Загрузка…"
      className={cn('shimmer rounded-md bg-layer-3', className)}
      {...props}
    />
  )
}
