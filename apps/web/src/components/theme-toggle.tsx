'use client'

import type { ThemeMode } from '@/lib/api/types'
import { useTheme } from '@/lib/theme/theme-provider'
import { cn } from '@/lib/utils'
import { Monitor, Moon, Sun } from 'lucide-react'
import { DropdownContent, DropdownItem, DropdownRoot, DropdownTrigger } from './ui/dropdown'

/**
 * Theme toggle dropdown (B3-THEME).
 *
 * 3 options: Light / Dark / System. Trigger показывает иконку текущего
 * resolved theme (Sun → light, Moon → dark). Если mode='system', показываем
 * resolved icon — пользователь видит "что сейчас", а не "что я выбрал".
 *
 * Active option выделен brand-цветом (one source of accent — design-system §8.2).
 *
 * Сходный размер с другими header-action иконками (Topbar Search / user-menu).
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

export interface ThemeToggleProps {
  /** Compact-вариант для marketing-header (меньше padding). По умолчанию — admin size. */
  compact?: boolean
  className?: string
}

export function ThemeToggle({ compact, className }: ThemeToggleProps) {
  const { mode, theme, setMode, hydrated } = useTheme()

  // До hydrate — рендерим placeholder fixed-size, чтобы layout не прыгал.
  // Иконку Sun (light) показываем как safe default — соответствует :root fallback.
  const TriggerIcon = !hydrated ? Sun : theme === 'dark' ? Moon : Sun

  return (
    <DropdownRoot>
      <DropdownTrigger
        aria-label="Сменить тему"
        className={cn(
          'inline-flex items-center justify-center rounded-md',
          'text-text-secondary hover:text-text-primary',
          'hover:bg-layer-2 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
          compact ? 'size-8' : 'size-9',
          className,
        )}
      >
        <TriggerIcon className={compact ? 'size-4' : 'size-[18px]'} aria-hidden />
      </DropdownTrigger>
      <DropdownContent align="end" className="min-w-[180px]">
        {OPTIONS.map(({ mode: optionMode, label, Icon }) => {
          const active = mode === optionMode
          return (
            <DropdownItem
              key={optionMode}
              onSelect={() => setMode(optionMode)}
              className={cn(active && 'text-brand-500')}
              aria-pressed={active}
              data-active={active ? 'true' : undefined}
            >
              <Icon className="size-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {active ? <span className="text-[11px] text-text-tertiary">●</span> : null}
            </DropdownItem>
          )
        })}
      </DropdownContent>
    </DropdownRoot>
  )
}
