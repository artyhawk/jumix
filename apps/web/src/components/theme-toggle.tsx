'use client'

import { useTheme } from '@/lib/theme/theme-provider'
import { cn } from '@/lib/utils'
import { Moon, Sun } from 'lucide-react'

/**
 * Theme toggle button (B3-THEME). Single click переключает между светлой и
 * тёмной (без 'system' opt-in — заказчик upreked dropdown как лишний UX).
 * Иконка показывает противоположное состояние — Moon когда сейчас light
 * («нажми чтобы стало dark»), Sun когда dark («нажми чтобы стало light»).
 */
export interface ThemeToggleProps {
  /** Compact-вариант для marketing-header (меньше padding). */
  compact?: boolean
  className?: string
}

export function ThemeToggle({ compact, className }: ThemeToggleProps) {
  const { theme, setMode, hydrated } = useTheme()

  // До hydrate — Moon (default = light, click → dark). После hydrate — opposite.
  const Icon = !hydrated ? Moon : theme === 'dark' ? Sun : Moon
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-md',
        'text-text-secondary hover:text-text-primary',
        'hover:bg-layer-2 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
        compact ? 'size-8' : 'size-9',
        className,
      )}
    >
      <Icon className={compact ? 'size-4' : 'size-[18px]'} aria-hidden />
    </button>
  )
}
