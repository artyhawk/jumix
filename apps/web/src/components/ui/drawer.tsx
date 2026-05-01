'use client'

import { cn } from '@/lib/utils'
import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { forwardRef } from 'react'

/**
 * Drawer — side panel. На desktop слайд справа ширина 400-480 (узко) или кастомная;
 * на mobile (<md) full-screen. Используется для деталей записи (клик на row в таблице).
 */

export const DrawerRoot = RadixDialog.Root
export const DrawerTrigger = RadixDialog.Trigger
export const DrawerClose = RadixDialog.Close

export const DrawerOverlay = forwardRef<
  React.ElementRef<typeof RadixDialog.Overlay>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Overlay>
>(function DrawerOverlay({ className, ...props }, ref) {
  return (
    <RadixDialog.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-40 bg-black/60 backdrop-blur-sm anim-fade', className)}
      {...props}
    />
  )
})

type Side = 'right' | 'left'

export interface DrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof RadixDialog.Content> {
  side?: Side
  showClose?: boolean
}

export const DrawerContent = forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  DrawerContentProps
>(function DrawerContent({ className, children, side = 'right', showClose = true, ...props }, ref) {
  return (
    <RadixDialog.Portal>
      <DrawerOverlay />
      <RadixDialog.Content
        ref={ref}
        className={cn(
          'fixed inset-y-0 z-50 h-dvh',
          'w-full md:max-w-[480px]',
          'bg-layer-2 shadow-2xl shadow-black/60',
          'flex flex-col',
          'focus:outline-none',
          side === 'right' && 'right-0 border-l border-border-default anim-slide-right',
          side === 'left' && 'left-0 border-r border-border-default anim-slide-left',
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <RadixDialog.Close
            aria-label="Закрыть"
            className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-layer-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="size-4" />
          </RadixDialog.Close>
        ) : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
})

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-4 sm:px-5 py-4 border-b border-border-subtle', className)} {...props} />
  )
}

export const DrawerTitle = forwardRef<
  React.ElementRef<typeof RadixDialog.Title>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(function DrawerTitle({ className, ...props }, ref) {
  return (
    <RadixDialog.Title
      ref={ref}
      className={cn('text-lg font-semibold text-text-primary', className)}
      {...props}
    />
  )
})

export function DrawerBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-auto px-4 sm:px-5 py-4', className)} {...props} />
}

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'px-4 sm:px-5 py-4 border-t border-border-subtle flex flex-wrap items-center justify-end gap-2',
        className,
      )}
      {...props}
    />
  )
}
