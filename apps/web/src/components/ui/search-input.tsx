'use client'

import { cn } from '@/lib/utils'
import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export interface SearchInputProps {
  value: string
  onDebouncedChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
  /** Aria label — обязательный, т.к. visual label отсутствует. */
  ariaLabel?: string
}

/**
 * Debounced search input — локальное состояние, через `debounceMs` мс
 * неактивности вызывает `onDebouncedChange`. Внешний `value` используется
 * только для initial/reset'а (когда URL-state меняется извне).
 */
export function SearchInput({
  value,
  onDebouncedChange,
  placeholder = 'Поиск…',
  debounceMs = 300,
  className,
  ariaLabel = 'Поиск',
}: SearchInputProps) {
  const [local, setLocal] = useState(value)
  const lastSentRef = useRef(value)

  useEffect(() => {
    if (value !== lastSentRef.current) {
      setLocal(value)
      lastSentRef.current = value
    }
  }, [value])

  useEffect(() => {
    if (local === lastSentRef.current) return
    const timer = setTimeout(() => {
      lastSentRef.current = local
      onDebouncedChange(local)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [local, debounceMs, onDebouncedChange])

  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-tertiary"
        strokeWidth={1.5}
      />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          'w-full min-h-[44px] md:min-h-0 md:h-10 pl-9 pr-9 rounded-[10px]',
          'bg-layer-1 border border-border-default text-sm text-text-primary',
          'placeholder:text-text-tertiary',
          'transition-colors duration-150',
          'focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30',
        )}
      />
      {local ? (
        <button
          type="button"
          aria-label="Очистить поиск"
          onClick={() => {
            setLocal('')
            lastSentRef.current = ''
            onDebouncedChange('')
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-7 items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-layer-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <X className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
