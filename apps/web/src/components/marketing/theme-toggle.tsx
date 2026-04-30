'use client'

import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
} from '@/components/ui/dropdown'
import type { ThemeMode } from '@/lib/api/types'
import { useTheme } from '@/lib/theme/theme-provider'
import { cn } from '@/lib/utils'
import { Monitor, Moon, Sun } from 'lucide-react'

/**
 * Theme toggle для marketing-header (B3-THEME-3). Использует `--m-*` palette
 * вместо admin token'ов чтобы визуально вписаться в landing-style. Same API
 * как admin ThemeToggle: 3 опции, иконка trigger показывает resolved theme.
 */
const OPTIONS: ReadonlyArray<{
  mode: ThemeMode
  label: string
  Icon: typeof Sun
}> = [
  { mode: 'light', label: 'Светлая', Icon: Sun },
  { mode: 'dark', label: 'Тёмная', Icon: Moon },
  { mode: 'system', label: 'Системная', Icon: Monitor },
]

export function MarketingThemeToggle({ className }: { className?: string }) {
  const { mode, theme, setMode, hydrated } = useTheme()
  const TriggerIcon = !hydrated ? Sun : theme === 'dark' ? Moon : Sun

  return (
    <DropdownRoot>
      <DropdownTrigger
        aria-label="Сменить тему"
        className={cn(
          'inline-flex items-center justify-center rounded-md size-9',
          'text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)]',
          'hover:bg-[var(--m-surface)] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)]',
          className,
        )}
      >
        <TriggerIcon className="size-[18px]" aria-hidden />
      </DropdownTrigger>
      <DropdownContent
        align="end"
        className="min-w-[180px] bg-[var(--m-surface-elevated)] border-[var(--m-border)]"
      >
        {OPTIONS.map(({ mode: optionMode, label, Icon }) => {
          const active = mode === optionMode
          return (
            <DropdownItem
              key={optionMode}
              onSelect={() => setMode(optionMode)}
              className={cn(
                'text-[var(--m-fg)] data-[highlighted]:bg-[var(--m-surface)]',
                active && 'text-[var(--m-brand)]',
              )}
              aria-pressed={active}
              data-active={active ? 'true' : undefined}
            >
              <Icon className="size-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {active ? <span className="text-[11px] text-[var(--m-fg-tertiary)]">●</span> : null}
            </DropdownItem>
          )
        })}
      </DropdownContent>
    </DropdownRoot>
  )
}
