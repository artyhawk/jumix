'use client'

import { cn, colorFromId, initials } from '@/lib/utils'
import * as RadixAvatar from '@radix-ui/react-avatar'
import { forwardRef } from 'react'

const sizeClasses = {
  xs: 'size-5 text-[10px]',
  sm: 'size-6 text-[11px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
  xl: 'size-14 text-base',
}

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  src?: string | null
  name: string
  userId?: string
  size?: keyof typeof sizeClasses
}

/**
 * Avatar с детерминированным fallback — инициалы на цвете, hash'ируемом из userId.
 */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { src, name, userId, size = 'md', className, ...props },
  ref,
) {
  const fallbackBg = userId ? colorFromId(userId) : '#3f3f46'
  const label = initials(name || '?')

  return (
    <RadixAvatar.Root
      ref={ref}
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-full select-none shrink-0',
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {src ? <RadixAvatar.Image src={src} alt={name} className="size-full object-cover" /> : null}
      <RadixAvatar.Fallback
        delayMs={src ? 200 : 0}
        className="size-full flex items-center justify-center font-semibold text-white"
        style={{ backgroundColor: fallbackBg }}
      >
        {label}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  )
})
