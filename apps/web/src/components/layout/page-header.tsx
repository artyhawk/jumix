import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}

/**
 * Общий заголовок страницы. Mobile — column (action внизу, full-width),
 * md+ — row с action справа.
 */
export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn('flex flex-col md:flex-row md:items-start md:justify-between gap-3', className)}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <h1 className="text-2xl md:text-[32px] md:leading-[40px] font-semibold tracking-tight text-text-primary">
          {title}
        </h1>
        {subtitle ? <p className="text-text-secondary">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0 w-full md:w-auto">{action}</div> : null}
    </div>
  )
}
