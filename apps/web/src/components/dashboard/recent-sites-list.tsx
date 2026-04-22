'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Site, SiteStatus } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useSites } from '@/lib/hooks/use-sites'
import { ArrowRight, MapPin } from 'lucide-react'
import Link from 'next/link'

const STATUS_VARIANT: Record<SiteStatus, 'active' | 'inactive' | 'terminated'> = {
  active: 'active',
  completed: 'inactive',
  archived: 'terminated',
}
const STATUS_LABEL: Record<SiteStatus, string> = {
  active: 'Активен',
  completed: 'Сдан',
  archived: 'В архиве',
}

/**
 * Right dashboard pane для owner'а — последние 5 объектов организации.
 * Row-click → `/sites?open=<id>` (drawer открывается на целевой странице).
 */
export function RecentSitesList() {
  const query = useSites({ limit: 5 })
  const items = query.data?.items ?? []

  return (
    <Card variant="default" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-layer-3 text-text-secondary">
            <MapPin className="size-4" strokeWidth={1.5} aria-hidden />
          </span>
          <h2 className="text-base font-semibold text-text-primary">Недавние объекты</h2>
        </div>
        <Link
          href="/sites"
          className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          Все
          <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
        </Link>
      </div>

      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          {['r1', 'r2', 'r3'].map((k) => (
            <Skeleton key={k} className="h-10 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="text-sm text-text-tertiary">Не удалось загрузить</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <div className="text-sm text-text-tertiary">Объектов пока нет</div>
          <Link
            href="/sites?create=true"
            className="text-sm font-medium text-brand-500 hover:underline"
          >
            Создать первый объект
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {items.map((s) => (
            <SiteRow key={s.id} site={s} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function SiteRow({ site }: { site: Site }) {
  return (
    <li>
      <Link
        href={`/sites?open=${site.id}`}
        className="group flex items-center gap-3 py-2.5 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded-md -mx-1 px-1"
      >
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium text-text-primary group-hover:text-brand-400 transition-colors">
            {site.name}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            {site.address ? <span className="truncate">{site.address}</span> : null}
            {site.address ? <span>·</span> : null}
            <span>{formatRelativeTime(site.createdAt)}</span>
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[site.status]}>{STATUS_LABEL[site.status]}</Badge>
      </Link>
    </li>
  )
}
