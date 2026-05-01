'use client'

import { cn } from '@/lib/utils'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { forwardRef } from 'react'

export const DropdownRoot = DropdownMenu.Root
export const DropdownTrigger = DropdownMenu.Trigger

export const DropdownContent = forwardRef<
  React.ElementRef<typeof DropdownMenu.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(function DropdownContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[180px] max-w-[calc(100vw-16px)] rounded-md border border-border-default bg-layer-3',
          'p-1 shadow-xl shadow-black/40 origin-top',
          'anim-fade-zoom',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  )
})

export const DropdownItem = forwardRef<
  React.ElementRef<typeof DropdownMenu.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { destructive?: boolean }
>(function DropdownItem({ className, destructive, ...props }, ref) {
  return (
    <DropdownMenu.Item
      ref={ref}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded text-sm outline-none cursor-pointer select-none',
        'transition-colors duration-100',
        'data-[highlighted]:bg-layer-4',
        'data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed',
        destructive ? 'text-danger data-[highlighted]:bg-danger/10' : 'text-text-primary',
        className,
      )}
      {...props}
    />
  )
})

export const DropdownSeparator = forwardRef<
  React.ElementRef<typeof DropdownMenu.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Separator>
>(function DropdownSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenu.Separator
      ref={ref}
      className={cn('my-1 h-px bg-border-subtle', className)}
      {...props}
    />
  )
})

export const DropdownLabel = forwardRef<
  React.ElementRef<typeof DropdownMenu.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Label>
>(function DropdownLabel({ className, ...props }, ref) {
  return (
    <DropdownMenu.Label
      ref={ref}
      className={cn(
        'px-2 py-1.5 text-[11px] uppercase tracking-wider text-text-tertiary',
        className,
      )}
      {...props}
    />
  )
})
