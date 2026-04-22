'use client'

import { PendingAttentionCallout } from '@/components/dashboard/pending-attention-callout'
import { StatCard } from '@/components/dashboard/stat-card'
import { PageTransition } from '@/components/motion/page-transition'
import { StaggerItem, StaggerList } from '@/components/motion/stagger-list'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { useDashboardStats } from '@/lib/hooks/use-dashboard'
import { t } from '@/lib/i18n'
import { IconCrane } from '@tabler/icons-react'
import {
  AlertCircle,
  Building2,
  CalendarRange,
  HardHat,
  type IdCard,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Superadmin dashboard (B3-UI-2). Owner/operator редиректятся на /;
 * редирект делает (app)/page.tsx по роли.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const router = useRouter()
  const stats = useDashboardStats()

  useEffect(() => {
    if (user && user.role !== 'superadmin') router.replace('/')
  }, [user, router])

  if (!user || user.role !== 'superadmin') return null

  return (
    <PageTransition>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-[32px] md:leading-[40px] font-semibold tracking-tight text-text-primary">
          {t('dashboard.title')}
        </h1>
        <p className="text-text-secondary">{t('dashboard.subtitle')}</p>
      </div>

      {stats.isError ? (
        <Card variant="default" className="flex items-start gap-3 border-status-danger/30">
          <AlertCircle className="size-5 text-status-danger mt-0.5" strokeWidth={1.5} aria-hidden />
          <div className="flex-1">
            <div className="text-sm font-semibold text-text-primary">
              {t('dashboard.errorTitle')}
            </div>
            <button
              type="button"
              onClick={() => stats.refetch()}
              className="text-sm text-brand-500 hover:underline mt-1"
            >
              {t('dashboard.retry')}
            </button>
          </div>
        </Card>
      ) : (
        <>
          {stats.data && (
            <PendingAttentionCallout
              craneProfiles={stats.data.pending.craneProfiles}
              organizationOperators={stats.data.pending.organizationOperators}
              cranes={stats.data.pending.cranes}
            />
          )}

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider">
              {t('dashboard.active.title')}
            </h2>
            <StaggerList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StaggerItem>
                <StatCard
                  icon={Building2}
                  label={t('dashboard.active.organizations')}
                  value={stats.data?.active.organizations ?? 0}
                  loading={stats.isLoading}
                  href="/organizations"
                />
              </StaggerItem>
              <StaggerItem>
                <StatCard
                  icon={HardHat}
                  label={t('dashboard.active.craneProfiles')}
                  value={stats.data?.active.craneProfiles ?? 0}
                  loading={stats.isLoading}
                  href="/crane-profiles"
                />
              </StaggerItem>
              <StaggerItem>
                <StatCard
                  icon={IconCrane as unknown as typeof IdCard}
                  label={t('dashboard.active.cranes')}
                  value={stats.data?.active.cranes ?? 0}
                  loading={stats.isLoading}
                  href="/cranes"
                />
              </StaggerItem>
              <StaggerItem>
                <StatCard
                  icon={UsersRound}
                  label={t('dashboard.active.memberships')}
                  value={stats.data?.active.memberships ?? 0}
                  loading={stats.isLoading}
                  href="/organization-operators"
                />
              </StaggerItem>
            </StaggerList>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <StatCard
              icon={Sparkles}
              label={t('dashboard.thisWeek.title')}
              value={stats.data?.thisWeek.newRegistrations ?? 0}
              loading={stats.isLoading}
              accent="brand"
            />
            <Card variant="default" className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center size-9 rounded-md border border-border-subtle bg-layer-3">
                <CalendarRange
                  className="size-5 text-text-secondary"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </span>
              <div className="text-sm text-text-secondary">
                Добро пожаловать, {user.name || 'администратор'}.
              </div>
            </Card>
          </div>
        </>
      )}
    </PageTransition>
  )
}
