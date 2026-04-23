'use client'

import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { LicenseUploadDialog } from '@/components/operator/license-upload-dialog'
import { MeIdentityCard } from '@/components/operator/me-identity-card'
import { MeLicenseCard } from '@/components/operator/me-license-card'
import { MeMembershipsSummary } from '@/components/operator/me-memberships-summary'
import { MeStatusCard } from '@/components/operator/me-status-card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { formatRuLongDate } from '@/lib/format/date'
import { useMeStatus } from '@/lib/hooks/use-me'
import { ShieldAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

/**
 * Operator landing (B3-UI-4): status + identity + license + memberships
 * summary. Primary workflow — mobile; web для edge cases (upload license
 * с ноутбука, проверить approval status).
 *
 * Single query `useMeStatus` для всего page — single source-of-truth.
 */
export default function MePage() {
  const { user } = useAuth()
  const router = useRouter()
  const status = useMeStatus()
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => {
    if (user && user.role !== 'operator') router.replace('/')
  }, [user, router])

  const formattedDate = useMemo(() => formatRuLongDate(), [])

  if (!user || user.role !== 'operator') return null

  if (status.isError) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
          <div className="text-sm text-text-secondary">Не удалось загрузить профиль</div>
          <Button variant="ghost" onClick={() => status.refetch()}>
            Повторить
          </Button>
        </div>
      </PageTransition>
    )
  }

  const data = status.data

  return (
    <PageTransition>
      <PageHeader title="Мой профиль" subtitle={formattedDate} />

      <MeStatusCard
        canWork={data?.canWork ?? false}
        reasons={data?.canWorkReasons ?? []}
        loading={status.isLoading}
      />

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MeIdentityCard profile={data.profile} />
            <MeLicenseCard
              profile={data.profile}
              licenseStatus={data.licenseStatus}
              onUploadClick={() => setUploadOpen(true)}
            />
          </div>
          <MeMembershipsSummary memberships={data.memberships} />
        </>
      ) : null}

      <LicenseUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </PageTransition>
  )
}
