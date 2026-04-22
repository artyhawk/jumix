import { cn } from '@/lib/utils'
import Image from 'next/image'

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
    <span
      className={cn('inline-flex items-center gap-2 select-none', className)}
      aria-label="Jumix"
    >
      <Image
        src="/brand/logo-mark.png"
        alt=""
        aria-hidden
        width={28}
        height={28}
        priority={priority}
        className="object-contain shrink-0"
      />
      <span className="text-text-primary font-semibold text-lg tracking-tight leading-none">
        Jumix
      </span>
    </span>
  )
}
