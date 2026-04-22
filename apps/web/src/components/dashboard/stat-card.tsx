'use client'

import { NumberCounter } from '@/components/motion/number-counter'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

/**
 * Stat-карточка для dashboard. Принимает лейбл + численное значение +
 * optional href (если карточка — ссылка на список). Пустое состояние
 * рендерит skeleton.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  href,
  accent,
  loading,
}: {
  icon: LucideIcon
  label: string
  value: number
  href?: string
  accent?: 'brand' | 'subtle'
  loading?: boolean
}) {
  const body = (
    <Card
      variant={href ? 'interactive' : 'default'}
      className={cn('h-full flex flex-col gap-3', accent === 'brand' && 'border-brand-500/40')}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center justify-center size-9 rounded-md border border-border-subtle bg-layer-3',
            accent === 'brand' && 'border-brand-500/30 bg-brand-500/10',
          )}
        >
          <Icon
            className={cn('size-5 text-text-secondary', accent === 'brand' && 'text-brand-500')}
            strokeWidth={1.5}
            aria-hidden
          />
        </span>
        <span className="text-sm font-medium text-text-secondary">{label}</span>
      </div>
      <div className="mt-auto">
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <NumberCounter
            value={value}
            className="text-[32px] leading-[40px] font-semibold text-text-primary"
          />
        )}
      </div>
    </Card>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-[12px]"
      >
        {body}
      </Link>
    )
  }
  return body
}
