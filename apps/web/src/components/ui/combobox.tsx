'use client'

import { cn } from '@/lib/utils'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { Check, ChevronDown, X } from 'lucide-react'
import { useState } from 'react'

export interface ComboboxOption<T extends string> {
  value: T
  label: string
  /** Secondary text справа (например, ИИН крановщика). */
  hint?: string
}

export interface ComboboxProps<T extends string> {
  value: T | null
  onChange: (value: T | null) => void
  options: ComboboxOption<T>[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  ariaLabel: string
  className?: string
  disabled?: boolean
  allowClear?: boolean
  /** Обратный вызов при изменении search-запроса (для async-загрузки). */
  onSearchChange?: (query: string) => void
  /** Сообщение во время async-загрузки. */
  loading?: boolean
}

/**
 * Searchable combobox — Popover + cmdk Command. Single-select, опционально clearable.
 * Для async-загрузки — передай `onSearchChange` и сам управляй `options`.
 */
export function Combobox<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Выбрать…',
  searchPlaceholder = 'Поиск…',
  emptyText = 'Ничего не найдено',
  ariaLabel,
  className,
  disabled,
  allowClear = true,
  onSearchChange,
  loading,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value) ?? null

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn('relative inline-flex items-stretch w-full', className)}>
        <Popover.Trigger
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'group inline-flex flex-1 min-w-0 items-center gap-2 rounded-[10px] border px-3',
            'min-h-[44px] md:min-h-0 md:h-10 text-sm',
            'bg-layer-1 border-border-default text-text-primary',
            'hover:border-border-strong transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:border-brand-500',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            selected && allowClear ? 'rounded-r-none border-r-0' : '',
          )}
        >
          <span
            className={cn(
              'flex-1 truncate text-left',
              selected ? 'text-text-primary' : 'text-text-tertiary',
            )}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-text-tertiary transition-transform group-data-[state=open]:rotate-180"
            strokeWidth={1.5}
            aria-hidden
          />
        </Popover.Trigger>
        {selected && allowClear ? (
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
            aria-label={`Очистить: ${ariaLabel}`}
            className={cn(
              'inline-flex items-center justify-center px-2 rounded-r-[10px] border border-border-default border-l-0',
              'bg-layer-1 text-text-tertiary hover:text-text-primary hover:bg-layer-2',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        ) : null}
      </div>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-border-default bg-layer-3',
            'shadow-xl shadow-black/40 origin-top',
            'anim-fade-zoom',
          )}
        >
          <Command
            className="flex flex-col overflow-hidden rounded-md"
            loop
            shouldFilter={!onSearchChange}
          >
            <div className="flex items-center border-b border-border-subtle px-2">
              <Command.Input
                placeholder={searchPlaceholder}
                onValueChange={onSearchChange}
                className="flex-1 h-10 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
            </div>
            <Command.List className="max-h-[240px] overflow-auto p-1">
              {loading ? (
                <div className="py-6 text-center text-sm text-text-tertiary">Загрузка…</div>
              ) : (
                <Command.Empty className="py-6 text-center text-sm text-text-tertiary">
                  {emptyText}
                </Command.Empty>
              )}
              {options.map((opt) => (
                <Command.Item
                  key={opt.value}
                  value={`${opt.label} ${opt.hint ?? ''}`.trim()}
                  onSelect={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-text-primary data-[selected=true]:bg-layer-4 cursor-pointer"
                >
                  <span className="inline-flex size-4 items-center justify-center">
                    {value === opt.value ? (
                      <Check className="size-3.5 text-brand-400" strokeWidth={2} aria-hidden />
                    ) : null}
                  </span>
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.hint ? (
                    <span className="text-xs text-text-tertiary shrink-0">{opt.hint}</span>
                  ) : null}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
