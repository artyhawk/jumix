'use client'

import { OwnerSitesMap } from '@/components/dashboard/owner-sites-map'
import { RecentSitesList } from '@/components/dashboard/recent-sites-list'
import { StatCard } from '@/components/dashboard/stat-card'
import { PageTransition } from '@/components/motion/page-transition'
import { StaggerItem, StaggerList } from '@/components/motion/stagger-list'
import { useAuth } from '@/hooks/use-auth'
import { formatRuLongDate } from '@/lib/format/date'
import { pluralRu } from '@/lib/format/plural'
import { useOwnerDashboardStats } from '@/lib/hooks/use-dashboard'
import { IconCrane } from '@tabler/icons-react'
import { HardHat, type IdCard, MapPin, Wallet } from 'lucide-react'
import { useMemo } from 'react'

const SITES_FORMS = ['объект', 'объекта', 'объектов'] as const

/**
 * Owner-кабинет landing page. Hero + 4 stats grid + 2-col (map + recent list).
 *
 * MVP: живые stats — активные объекты + краны в работе из
 * `/dashboard/owner-stats`. Карточки «Операторы на смене» и «Расходы» —
 * placeholder'ы `—`, реализуются в этапе 3.
 */
export function OwnerDashboard() {
  const { user } = useAuth()
  const stats = useOwnerDashboardStats()

  const formattedDate = useMemo(() => formatRuLongDate(), [])
  const activeSitesCount = stats.data?.active.sites ?? 0
  const activeCranesCount = stats.data?.active.cranes ?? 0
  const sitesLabel = `${activeSitesCount} ${pluralRu(activeSitesCount, SITES_FORMS)} активно`

  return (
    <PageTransition>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-[32px] md:leading-[40px] font-semibold tracking-tight text-text-primary">
          {user?.name ? `Здравствуйте, ${user.name}` : 'Обзор организации'}
        </h1>
        <p className="text-sm text-text-secondary">
          {formattedDate} · {sitesLabel}
        </p>
      </div>

      <StaggerList className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StaggerItem>
          <StatCard
            icon={MapPin}
            label="Активные объекты"
            value={activeSitesCount}
            loading={stats.isLoading}
            href="/sites"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            icon={IconCrane as unknown as typeof MapPin}
            label="Краны в работе"
            value={activeCranesCount}
            loading={stats.isLoading}
            href="/my-cranes"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCardPlaceholder icon={HardHat} label="Операторы на смене" />
        </StaggerItem>
        <StaggerItem>
          <StatCardPlaceholder icon={Wallet} label="Расходы за месяц" />
        </StaggerItem>
      </StaggerList>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <OwnerSitesMap />
        <RecentSitesList />
      </div>
    </PageTransition>
  )
}

/**
 * Dashed-card для метрик, которые будут доступны в следующих фазах. Тот же
 * layout что StatCard, но value заменён на `—` + подпись "Скоро".
 */
function StatCardPlaceholder({
  icon: Icon,
  label,
}: {
  icon: typeof IdCard
  label: string
}) {
  return (
    <div className="h-full rounded-[12px] border border-dashed border-border-subtle bg-layer-2/50 p-4 md:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center size-9 rounded-md border border-border-subtle bg-layer-3">
          <Icon className="size-5 text-text-tertiary" strokeWidth={1.5} aria-hidden />
        </span>
        <span className="text-sm font-medium text-text-tertiary">{label}</span>
      </div>
      <div className="mt-auto flex items-baseline gap-2">
        <span className="text-[32px] leading-[40px] font-semibold text-text-tertiary">—</span>
        <span className="text-xs text-text-tertiary">Скоро</span>
      </div>
    </div>
  )
}
