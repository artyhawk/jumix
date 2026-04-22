'use client'

import { cn } from '@/lib/utils'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { forwardRef } from 'react'

export const TooltipProvider = RadixTooltip.Provider
export const TooltipRoot = RadixTooltip.Root
export const TooltipTrigger = RadixTooltip.Trigger

export const TooltipContent = forwardRef<
  React.ElementRef<typeof RadixTooltip.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTooltip.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded border border-border-strong bg-layer-4 px-2 py-1 text-xs text-text-primary shadow-md',
          'anim-fade-zoom origin-bottom',
          className,
        )}
        {...props}
      />
    </RadixTooltip.Portal>
  )
})

/** Shorthand: Tooltip + Trigger + Content в одном компоненте (для 90% случаев). */
export function Tooltip({
  label,
  children,
  side = 'top',
  delay = 400,
}: {
  label: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}) {
  return (
    <RadixTooltip.Root delayDuration={delay}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </RadixTooltip.Root>
  )
}
