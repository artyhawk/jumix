'use client'

import { StaggerItem, StaggerList } from '@/components/motion/stagger-list'
import {
  useApproveOrganizationOperator,
  useOrganizationOperators,
} from '@/lib/hooks/use-organization-operators'
import { useState } from 'react'
import { EmptyQueue } from './empty-queue'
import { HireApprovalRow } from './hire-approval-row'
import { QueueError } from './queue-error'
import { QueueSkeleton } from './queue-skeleton'
import { RejectDialog } from './reject-dialog'

export function HiresQueue() {
  const { data, isLoading, isError, refetch } = useOrganizationOperators({
    approvalStatus: 'pending',
    limit: 50,
  })
  const approveMutation = useApproveOrganizationOperator()
  const [rejectTarget, setRejectTarget] = useState<{ id: string; label: string } | null>(null)

  if (isLoading) return <QueueSkeleton />
  if (isError) return <QueueError onRetry={() => refetch()} />

  const items = data?.items ?? []
  if (items.length === 0) return <EmptyQueue type="hires" />

  return (
    <>
      <StaggerList stagger={0.04} className="flex flex-col gap-2">
        {items.map((hire) => (
          <StaggerItem key={hire.id}>
            <HireApprovalRow
              hire={hire}
              onApprove={() => approveMutation.mutate(hire.id)}
              onReject={() =>
                setRejectTarget({
                  id: hire.id,
                  label: [
                    hire.craneProfile.lastName,
                    hire.craneProfile.firstName,
                    hire.craneProfile.patronymic,
                  ]
                    .filter(Boolean)
                    .join(' '),
                })
              }
              isPending={approveMutation.isPending && approveMutation.variables === hire.id}
            />
          </StaggerItem>
        ))}
      </StaggerList>

      <RejectDialog
        open={rejectTarget !== null}
        onOpenChange={(v) => {
          if (!v) setRejectTarget(null)
        }}
        entity="hire"
        entityId={rejectTarget?.id ?? null}
        entityLabel={rejectTarget?.label ?? ''}
      />
    </>
  )
}
