'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { Skeleton } from './skeleton'

export interface DataTableColumn<Row> {
  key: string
  header: ReactNode
  /** Рендер ячейки. Если опущено — колонка рендерится пустой. */
  cell: (row: Row) => ReactNode
  /** Показывать на mobile cards? Desktop-only колонки (timestamps) = false. */
  showOnMobile?: boolean
  /** Выравнивание содержимого. */
  align?: 'left' | 'right' | 'center'
  /** Фиксированная ширина desktop-колонки (например, '120px'). */
  width?: string
  /** Второстепенная колонка — приглушается text-text-secondary на desktop. */
  muted?: boolean
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  onRowClick?: (row: Row) => void
  /** Плотность таблицы. `default` = 44px минимум, `compact` = 36px. */
  density?: 'default' | 'compact'
  /** Состояние загрузки первой страницы — skeleton rows. */
  loading?: boolean
  /** Empty state — показывается когда !loading && rows.length === 0. */
  empty?: ReactNode
  /** Есть ли следующая страница — показывает "Загрузить ещё" кнопку. */
  hasMore?: boolean
  /** Идёт ли догрузка следующей страницы. */
  loadingMore?: boolean
  /** Обработчик клика "Загрузить ещё". */
  onLoadMore?: () => void
  /** Mobile-only title rendering: возвращает JSX заголовка карточки (FIO, name). */
  mobileTitle?: (row: Row) => ReactNode
  /** Mobile-only subtitle — вторая строка карточки. */
  mobileSubtitle?: (row: Row) => ReactNode
  className?: string
  ariaLabel?: string
}

const alignCls: Record<NonNullable<DataTableColumn<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

/**
 * Таблица со встроенной responsive-трансформацией: desktop table → mobile cards.
 *
 * Desktop (≥md): полная таблица, hover = orange-500/10 левая полоска + bg-layer-2.
 * Mobile (<md): карточки с title/subtitle + columns (where showOnMobile!==false) как label/value пары.
 *
 * Infinite loading: `onLoadMore` + `hasMore` рендерят кнопку внизу. Полноценный
 * IntersectionObserver-триггер — см. B3-UI-2c+ (backlog).
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  density = 'default',
  loading,
  empty,
  hasMore,
  loadingMore,
  onLoadMore,
  mobileTitle,
  mobileSubtitle,
  className,
  ariaLabel,
}: DataTableProps<Row>) {
  const rowHeight = density === 'compact' ? 'h-9' : 'min-h-[44px] md:h-11'
  const cellPy = density === 'compact' ? 'py-1.5' : 'py-2.5'
  const mobileColumns = columns.filter((c) => c.showOnMobile !== false)

  if (loading) {
    return (
      <div className={cn('w-full', className)}>
        <div className="hidden md:block overflow-hidden rounded-[12px] border border-border-subtle bg-layer-1">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-border-subtle bg-layer-2">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      'px-3 py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary',
                      alignCls[col.align ?? 'left'],
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['sk1', 'sk2', 'sk3', 'sk4', 'sk5', 'sk6'].map((k) => (
                <tr key={k} className="border-b border-border-subtle last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-3', cellPy)}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden flex flex-col gap-2">
          {['sk1', 'sk2', 'sk3', 'sk4', 'sk5'].map((k) => (
            <div key={k} className="rounded-[12px] border border-border-subtle bg-layer-1 p-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!rows.length) {
    return <div className={className}>{empty ?? null}</div>
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="hidden md:block overflow-hidden rounded-[12px] border border-border-subtle bg-layer-1">
        <table className="w-full table-fixed border-collapse" aria-label={ariaLabel}>
          <thead>
            <tr className="border-b border-border-subtle bg-layer-2">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-3 py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary',
                    alignCls[col.align ?? 'left'],
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onRowClick(row)
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  'group relative border-b border-border-subtle last:border-0',
                  'transition-colors duration-100',
                  onRowClick ? 'cursor-pointer hover:bg-layer-2' : '',
                  rowHeight,
                )}
              >
                {onRowClick ? (
                  <td
                    aria-hidden
                    className="absolute left-0 top-0 h-full w-[2px] bg-transparent group-hover:bg-brand-500 transition-colors"
                  />
                ) : null}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-3 text-sm',
                      cellPy,
                      alignCls[col.align ?? 'left'],
                      col.muted ? 'text-text-secondary' : 'text-text-primary',
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex flex-col gap-2">
        {rows.map((row) => (
          <button
            key={rowKey(row)}
            type="button"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            disabled={!onRowClick}
            className={cn(
              'text-left w-full rounded-[12px] border border-border-subtle bg-layer-1 p-3',
              onRowClick
                ? 'hover:bg-layer-2 active:bg-layer-3 transition-colors min-h-[44px]'
                : 'cursor-default',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
            )}
          >
            {mobileTitle ? (
              <div className="font-medium text-text-primary">{mobileTitle(row)}</div>
            ) : null}
            {mobileSubtitle ? (
              <div className="text-xs text-text-tertiary mt-0.5">{mobileSubtitle(row)}</div>
            ) : null}
            {mobileColumns.length > 0 ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
                {mobileColumns.map((col) => (
                  <div key={col.key} className="flex flex-col min-w-0">
                    <dt className="text-[10px] uppercase tracking-wider text-text-tertiary">
                      {col.header}
                    </dt>
                    <dd className="text-sm text-text-primary truncate">{col.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </button>
        ))}
      </div>

      {hasMore ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className={cn(
              'inline-flex items-center gap-2 rounded-[10px] border border-border-default bg-layer-2 px-4 min-h-[44px] md:h-9 text-sm text-text-secondary',
              'hover:text-text-primary hover:bg-layer-3 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
            )}
          >
            {loadingMore ? 'Загрузка…' : 'Загрузить ещё'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
