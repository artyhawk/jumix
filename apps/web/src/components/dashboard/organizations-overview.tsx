'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Organization, OrganizationStatus } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useOrganizations } from '@/lib/hooks/use-organizations'
import { ArrowRight, Building2 } from 'lucide-react'
import Link from 'next/link'

const STATUS_VARIANT: Record<OrganizationStatus, 'active' | 'inactive' | 'terminated'> = {
  active: 'active',
  suspended: 'inactive',
  archived: 'terminated',
}
const STATUS_LABEL: Record<OrganizationStatus, string> = {
  active: 'Активна',
  suspended: 'Приостановлена',
  archived: 'В архиве',
}

export function OrganizationsOverview() {
  const query = useOrganizations({ limit: 5 })
  const items = query.data?.items ?? []

  return (
    <Card variant="default" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-layer-3 text-text-secondary">
            <Building2 className="size-4" strokeWidth={1.5} aria-hidden />
          </span>
          <h2 className="text-base font-semibold text-text-primary">Недавние организации</h2>
        </div>
        <Link
          href="/organizations"
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
        <div className="text-sm text-text-tertiary">Организаций пока нет</div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {items.map((o) => (
            <OrganizationRow key={o.id} org={o} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function OrganizationRow({ org }: { org: Organization }) {
  return (
    <li>
      <Link
        href={`/organizations?open=${org.id}`}
        className="group flex items-center gap-3 py-2.5 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded-md -mx-1 px-1"
      >
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium text-text-primary group-hover:text-brand-400 transition-colors">
            {org.name}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span className="font-mono-numbers">{org.bin}</span>
            <span>·</span>
            <span>{formatRelativeTime(org.createdAt)}</span>
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[org.status]}>{STATUS_LABEL[org.status]}</Badge>
      </Link>
    </li>
  )
}
