'use client'

import { CraneProfilesQueue } from '@/components/approvals/crane-profiles-queue'
import { CranesQueue } from '@/components/approvals/cranes-queue'
import { HiresQueue } from '@/components/approvals/hires-queue'
import { PageHeader } from '@/components/layout/page-header'
import { FadeSwap } from '@/components/motion/fade-swap'
import { PageTransition } from '@/components/motion/page-transition'
import { TabsPills } from '@/components/ui/tabs-pills'
import { useAuth } from '@/hooks/use-auth'
import { useDashboardStats } from '@/lib/hooks/use-dashboard'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

const TABS = ['crane-profiles', 'hires', 'cranes'] as const
type TabValue = (typeof TABS)[number]
const DEFAULT_TAB: TabValue = 'crane-profiles'

function isValidTab(v: string | null): v is TabValue {
  return v !== null && (TABS as readonly string[]).includes(v)
}

export default function ApprovalsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const stats = useDashboardStats()

  const rawTab = params.get('tab')
  const activeTab: TabValue = isValidTab(rawTab) ? rawTab : DEFAULT_TAB

  // Invalid tab в URL → replace (не засоряем history).
  useEffect(() => {
    if (rawTab !== null && !isValidTab(rawTab)) {
      router.replace(`/approvals?tab=${DEFAULT_TAB}`)
    }
  }, [rawTab, router])

  // Non-superadmin редирект на /.
  useEffect(() => {
    if (user && user.role !== 'superadmin') router.replace('/')
  }, [user, router])

  if (!user || user.role !== 'superadmin') return null

  const switchTab = (next: string) => {
    if (!isValidTab(next) || next === activeTab) return
    router.push(`/approvals?tab=${next}`)
  }

  const pending = stats.data?.pending

  return (
    <PageTransition>
      <PageHeader
        title="Заявки на рассмотрение"
        subtitle="Одобрение крановщиков, наймов и кранов"
      />

      <TabsPills
        value={activeTab}
        onValueChange={switchTab}
        tabs={[
          {
            value: 'crane-profiles',
            label: 'Крановщики',
            badge: pending?.craneProfiles,
          },
          { value: 'hires', label: 'Наймы', badge: pending?.organizationOperators },
          { value: 'cranes', label: 'Краны', badge: pending?.cranes },
        ]}
      />

      <FadeSwap swapKey={activeTab}>
        {activeTab === 'crane-profiles' ? <CraneProfilesQueue /> : null}
        {activeTab === 'hires' ? <HiresQueue /> : null}
        {activeTab === 'cranes' ? <CranesQueue /> : null}
      </FadeSwap>
    </PageTransition>
  )
}
