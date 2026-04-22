'use client'

import { Card } from '@/components/ui/card'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ArrowRight, HardHat, ShieldCheck, UsersRound } from 'lucide-react'
import Link from 'next/link'

export function PendingAttentionCallout({
  craneProfiles,
  organizationOperators,
  cranes,
}: {
  craneProfiles: number
  organizationOperators: number
  cranes: number
}) {
  const total = craneProfiles + organizationOperators + cranes

  return (
    <Card variant="elevated" className="border-brand-500/30 bg-brand-500/5">
      <div className="flex items-center gap-3 mb-4">
        <span className="inline-flex items-center justify-center size-9 rounded-md bg-brand-500/15 border border-brand-500/30">
          <ShieldCheck className="size-5 text-brand-500" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <div className="text-[18px] leading-7 font-semibold text-text-primary">
            {t('dashboard.pending.title')}
          </div>
          <div className="text-sm text-text-secondary">
            {t('dashboard.pending.review')} — {total}
          </div>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <PendingRow
          href="/approvals?tab=crane-profiles"
          icon={<HardHat className="size-4" strokeWidth={1.5} aria-hidden />}
          label={t('dashboard.pending.craneProfiles')}
          count={craneProfiles}
        />
        <PendingRow
          href="/approvals?tab=hires"
          icon={<UsersRound className="size-4" strokeWidth={1.5} aria-hidden />}
          label={t('dashboard.pending.organizationOperators')}
          count={organizationOperators}
        />
        <PendingRow
          href="/approvals?tab=cranes"
          icon={<ShieldCheck className="size-4" strokeWidth={1.5} aria-hidden />}
          label={t('dashboard.pending.cranes')}
          count={cranes}
        />
      </div>
    </Card>
  )
}

function PendingRow({
  href,
  icon,
  label,
  count,
}: {
  href: string
  icon: React.ReactNode
  label: string
  count: number
}) {
  const dimmed = count === 0
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-layer-2 px-3 min-h-[44px] md:min-h-0 md:h-11 transition-colors duration-200 hover:border-border-default',
        dimmed && 'opacity-60',
      )}
    >
      <span className="flex items-center gap-2 text-sm text-text-primary">
        <span className="text-text-tertiary">{icon}</span>
        <span>{label}</span>
      </span>
      <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-text-primary">
        {count}
        <ArrowRight
          className="size-3.5 text-text-tertiary group-hover:translate-x-0.5 transition-transform"
          strokeWidth={1.5}
          aria-hidden
        />
      </span>
    </Link>
  )
}
