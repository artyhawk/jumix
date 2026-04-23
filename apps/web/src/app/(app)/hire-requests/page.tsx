'use client'

import { EmptyQueue } from '@/components/approvals/empty-queue'
import { QueueError } from '@/components/approvals/queue-error'
import { QueueSkeleton } from '@/components/approvals/queue-skeleton'
import { OrganizationOperatorDrawer } from '@/components/drawers/organization-operator-drawer'
import { CreateHireRequestDialog } from '@/components/hires/create-hire-request-dialog'
import { PendingHireRow } from '@/components/hires/pending-hire-row'
import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { StaggerItem, StaggerList } from '@/components/motion/stagger-list'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useOrganizationOperatorsInfinite } from '@/lib/hooks/use-organization-operators'
import { Plus } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'

/**
 * Owner workflow для pending hires: submit + await approval. Approved /
 * rejected записи живут в /my-operators (rejected скрыты в MVP — backlog).
 */
export default function HireRequestsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()

  const openId = params.get('open')
  const createOpen = params.get('create') === 'true'

  useEffect(() => {
    if (user && user.role !== 'owner') router.replace('/')
  }, [user, router])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.replace(qs ? `/hire-requests?${qs}` : '/hire-requests', { scroll: false })
  }

  const { data, isLoading, isError, refetch } = useOrganizationOperatorsInfinite({
    approvalStatus: 'pending',
    limit: 50,
  })

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const pendingCount = items.length

  if (!user || user.role !== 'owner') return null

  return (
    <PageTransition>
      <PageHeader
        title="Заявки на найм"
        subtitle={
          pendingCount > 0
            ? `${pendingCount} на рассмотрении`
            : 'Нет активных заявок на рассмотрении'
        }
        action={
          <Button
            variant="primary"
            onClick={() => setParam('create', 'true')}
            className="w-full md:w-auto"
          >
            <Plus className="size-4" strokeWidth={1.5} aria-hidden />
            Нанять крановщика
          </Button>
        }
      />

      {isLoading ? (
        <QueueSkeleton count={3} />
      ) : isError ? (
        <QueueError onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <EmptyQueue type="hires" />
          <Button variant="primary" onClick={() => setParam('create', 'true')}>
            Нанять крановщика
          </Button>
        </div>
      ) : (
        <StaggerList className="flex flex-col gap-2">
          {items.map((hire) => (
            <StaggerItem key={hire.id}>
              <PendingHireRow hire={hire} onClick={() => setParam('open', hire.id)} />
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      <OrganizationOperatorDrawer
        id={openId}
        onOpenChange={(next) => {
          if (!next) setParam('open', null)
        }}
      />
      <CreateHireRequestDialog
        open={createOpen}
        onOpenChange={(next) => setParam('create', next ? 'true' : null)}
      />
    </PageTransition>
  )
}
