'use client'

import { cn } from '@/lib/utils'
import * as RadixTabs from '@radix-ui/react-tabs'
import { motion } from 'framer-motion'

export interface TabsPillsItem {
  value: string
  label: string
  badge?: number
}

interface TabsPillsProps {
  value: string
  onValueChange: (v: string) => void
  tabs: TabsPillsItem[]
  className?: string
}

/**
 * Pill-style tabs с framer-motion layoutId — активный фон плавно перетекает
 * между табами. На мобиле табы скроллятся горизонтально (iOS settings pattern).
 *
 * Touch target: 44px на phone, 36px на desktop.
 */
export function TabsPills({ value, onValueChange, tabs, className }: TabsPillsProps) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List className="inline-flex items-center gap-1 bg-layer-2 border border-border-subtle rounded-full p-1 overflow-x-auto max-w-full">
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              'relative rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap',
              'text-text-secondary hover:text-text-primary transition-colors',
              'data-[state=active]:text-brand-400',
              'min-h-[44px] md:min-h-0 md:py-1.5',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            )}
          >
            {value === tab.value && (
              <motion.span
                layoutId="tabs-pills-active"
                className="absolute inset-0 bg-brand-500/15 rounded-full"
                transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                aria-hidden
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-2">
              {tab.label}
              {typeof tab.badge === 'number' && tab.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs tabular-nums font-semibold bg-layer-3 text-text-primary rounded-full">
                  {tab.badge}
                </span>
              )}
              {typeof tab.badge === 'number' && tab.badge === 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs tabular-nums text-text-tertiary">
                  0
                </span>
              )}
            </span>
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
    </RadixTabs.Root>
  )
}
