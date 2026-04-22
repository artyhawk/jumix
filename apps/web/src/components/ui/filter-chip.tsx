'use client'

import { cn } from '@/lib/utils'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown, X } from 'lucide-react'
import type { ReactNode } from 'react'

export interface FilterChipOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export interface FilterChipProps<T extends string> {
  label: string
  value: T | null
  options: FilterChipOption<T>[]
  onChange: (value: T | null) => void
  icon?: ReactNode
  allLabel?: string
  className?: string
}

/**
 * Single-select filter chip — label + текущее значение + caret.
 * Active (value != null) — brand orange border/text; inactive — нейтральный.
 * Используется в FilterBar. Очистить можно через кнопку-крестик или пункт "Все".
 */
export function FilterChip<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
  allLabel = 'Все',
  className,
}: FilterChipProps<T>) {
  const active = value !== null
  const selected = options.find((o) => o.value === value)

  return (
    <DropdownMenu.Root>
      <div className={cn('inline-flex items-stretch', className)}>
        <DropdownMenu.Trigger
          className={cn(
            'group inline-flex items-center gap-1.5 rounded-[10px] border px-3',
            'min-h-[36px] text-sm whitespace-nowrap',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
            active
              ? 'border-brand-500 bg-brand-500/10 text-brand-400 hover:bg-brand-500/15'
              : 'border-border-default bg-layer-2 text-text-secondary hover:text-text-primary hover:bg-layer-3',
            active ? 'rounded-r-none border-r-0' : '',
          )}
          aria-label={`Фильтр: ${label}`}
        >
          {icon ? <span className="text-current">{icon}</span> : null}
          <span className={cn('font-medium', active ? 'text-brand-400' : 'text-text-tertiary')}>
            {label}
          </span>
          {selected ? (
            <>
              <span className="text-text-tertiary">·</span>
              <span className="text-current">{selected.label}</span>
            </>
          ) : null}
          <ChevronDown
            className="size-3.5 text-current opacity-70 transition-transform group-data-[state=open]:rotate-180"
            strokeWidth={1.5}
            aria-hidden
          />
        </DropdownMenu.Trigger>
        {active ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Очистить фильтр: ${label}`}
            className={cn(
              'inline-flex items-center justify-center px-2 rounded-r-[10px] border border-brand-500',
              'bg-brand-500/10 text-brand-400 hover:bg-brand-500/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
            )}
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        ) : null}
      </div>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 min-w-[200px] rounded-md border border-border-default bg-layer-3',
            'p-1 shadow-xl shadow-black/40 origin-top',
            'anim-fade-zoom',
          )}
        >
          <DropdownMenu.Item
            onSelect={() => onChange(null)}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded text-sm outline-none cursor-pointer select-none',
              'text-text-secondary',
              'transition-colors duration-100',
              'data-[highlighted]:bg-layer-4',
            )}
          >
            <span className="inline-flex size-4 items-center justify-center">
              {value === null ? (
                <Check className="size-3.5 text-brand-400" strokeWidth={2} aria-hidden />
              ) : null}
            </span>
            <span>{allLabel}</span>
          </DropdownMenu.Item>
          {options.map((opt) => (
            <DropdownMenu.Item
              key={opt.value}
              onSelect={() => onChange(opt.value)}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded text-sm outline-none cursor-pointer select-none',
                'text-text-primary',
                'transition-colors duration-100',
                'data-[highlighted]:bg-layer-4',
              )}
            >
              <span className="inline-flex size-4 items-center justify-center">
                {value === opt.value ? (
                  <Check className="size-3.5 text-brand-400" strokeWidth={2} aria-hidden />
                ) : null}
              </span>
              {opt.icon ? <span className="text-text-tertiary">{opt.icon}</span> : null}
              <span>{opt.label}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
