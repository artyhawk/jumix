'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface FilterBarProps {
  /** Обычно SearchInput — идёт слева на desktop, сверху на mobile. */
  search?: ReactNode
  /** FilterChip'ы и подобные — скроллятся горизонтально на mobile. */
  children?: ReactNode
  /** Правая секция — обычно кнопки "Создать" или счётчик. */
  actions?: ReactNode
  className?: string
}

/**
 * Контейнер для панели фильтров. Mobile: search full-width сверху, chips скроллятся
 * горизонтально ниже. Desktop: search + chips + actions в одну строку.
 */
export function FilterBar({ search, children, actions, className }: FilterBarProps) {
  return (
    <div
      className={cn('flex flex-col gap-3 md:flex-row md:items-center md:gap-2', className)}
      role="toolbar"
      aria-label="Фильтры"
    >
      {search ? <div className="md:w-72 md:shrink-0">{search}</div> : null}
      {children ? (
        <div className="flex items-center gap-2 overflow-x-auto md:flex-wrap md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 md:flex-1 min-w-0">
          {children}
        </div>
      ) : (
        <div className="md:flex-1" />
      )}
      {actions ? <div className="flex items-center gap-2 md:ml-auto">{actions}</div> : null}
    </div>
  )
}
