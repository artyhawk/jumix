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
import { AlertTriangle, MapPin, UsersRound } from 'lucide-react'
import { useMemo } from 'react'

const SITES_FORMS = ['объект', 'объекта', 'объектов'] as const

/**
 * Owner-кабинет landing page. Hero + 4 stats grid + 2-col (map + recent list).
 *
 * MVP: живые stats — активные объекты + краны в работе + активные операторы
 * из `/dashboard/owner-stats`. Карточка «Расходы» — placeholder'а `—`,
 * реализуется в этапе 3.
 */
export function OwnerDashboard() {
  const { user } = useAuth()
  const stats = useOwnerDashboardStats()

  const formattedDate = useMemo(() => formatRuLongDate(), [])
  const activeSitesCount = stats.data?.active.sites ?? 0
  const activeCranesCount = stats.data?.active.cranes ?? 0
  const activeOperatorsCount = stats.data?.active.memberships ?? 0
  const pendingIncidentsCount = stats.data?.pending.incidents ?? 0
  const hasCriticalIncidents = (stats.data?.pending.criticalIncidents ?? 0) > 0
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
          <StatCard
            icon={UsersRound}
            label="Активные операторы"
            value={activeOperatorsCount}
            loading={stats.isLoading}
            href="/my-operators"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            icon={AlertTriangle}
            label="Происшествия"
            value={pendingIncidentsCount}
            loading={stats.isLoading}
            href="/incidents"
            highlight={hasCriticalIncidents ? 'danger' : null}
          />
        </StaggerItem>
      </StaggerList>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <OwnerSitesMap />
        <RecentSitesList />
      </div>
    </PageTransition>
  )
}
