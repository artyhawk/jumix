'use client'

import { useTheme } from '@/lib/theme/theme-provider'
import { cn } from '@/lib/utils'
import { Moon, Sun } from 'lucide-react'

/**
 * Theme toggle для marketing-header (B3-THEME-3). Использует `--m-*` palette
 * вместо admin token'ов чтобы визуально вписаться в landing-style. Single
 * click переключает light↔dark (no 'system' opt-in — заказчик upreked dropdown).
 */
export function MarketingThemeToggle({ className }: { className?: string }) {
  const { theme, setMode, hydrated } = useTheme()
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
        'inline-flex items-center justify-center rounded-md size-9',
        'text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)]',
        'hover:bg-[var(--m-surface)] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)]',
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  )
}
