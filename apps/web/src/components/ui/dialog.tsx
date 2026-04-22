'use client'

import { cn } from '@/lib/utils'
import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { forwardRef } from 'react'

export const DialogRoot = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close

export const DialogOverlay = forwardRef<
  React.ElementRef<typeof RadixDialog.Overlay>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <RadixDialog.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-40 bg-black/60 backdrop-blur-sm anim-fade', className)}
      {...props}
    />
  )
})

export const DialogContent = forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Content> & {
    showClose?: boolean
  }
>(function DialogContent({ className, children, showClose = true, ...props }, ref) {
  return (
    <RadixDialog.Portal>
      <DialogOverlay />
      <RadixDialog.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
          'w-[calc(100vw-32px)] max-w-lg',
          'rounded-[12px] border border-border-default bg-layer-2 shadow-2xl shadow-black/50',
          'p-6',
          'anim-fade-zoom',
          'focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <RadixDialog.Close
            aria-label="Закрыть"
            className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-layer-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="size-4" />
          </RadixDialog.Close>
        ) : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
})

export const DialogTitle = forwardRef<
  React.ElementRef<typeof RadixDialog.Title>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <RadixDialog.Title
      ref={ref}
      className={cn(
        'text-[20px] md:text-[24px] leading-tight font-semibold text-text-primary',
        className,
      )}
      {...props}
    />
  )
})

export const DialogDescription = forwardRef<
  React.ElementRef<typeof RadixDialog.Description>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <RadixDialog.Description
      ref={ref}
      className={cn('mt-2 text-sm text-text-secondary', className)}
      {...props}
    />
  )
})
