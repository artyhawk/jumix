import { cn } from '@/lib/utils'
import Image from 'next/image'

/**
 * Logo-компонент. `mark` — знак "J" (collapsed sidebar, favicon). `full` — полный.
 * Используем next/image с explicit width/height — иначе Next шлёт оригинал 5504×1642.
 */
export function Logo({
  variant = 'full',
  className,
  priority = false,
}: {
  variant?: 'full' | 'mark'
  className?: string
  priority?: boolean
}) {
  if (variant === 'mark') {
    return (
      <Image
        src="/brand/logo-mark.png"
        alt="Jumix"
        width={32}
        height={32}
        priority={priority}
        className={cn('object-contain', className)}
      />
    )
  }

  return (
    <Image
      src="/brand/logo-full.png"
      alt="Jumix"
      width={120}
      height={36}
      priority={priority}
      className={cn('object-contain h-9 w-auto', className)}
    />
  )
}
