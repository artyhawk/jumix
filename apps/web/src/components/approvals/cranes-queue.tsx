'use client'

import { StaggerItem, StaggerList } from '@/components/motion/stagger-list'
import { useApproveCrane, useCranes } from '@/lib/hooks/use-cranes'
import { useState } from 'react'
import { CraneApprovalRow } from './crane-approval-row'
import { EmptyQueue } from './empty-queue'
import { QueueError } from './queue-error'
import { QueueSkeleton } from './queue-skeleton'
import { RejectDialog } from './reject-dialog'

export function CranesQueue() {
  const { data, isLoading, isError, refetch } = useCranes({
    approvalStatus: 'pending',
    limit: 50,
  })
  const approveMutation = useApproveCrane()
  const [rejectTarget, setRejectTarget] = useState<{ id: string; label: string } | null>(null)

  if (isLoading) return <QueueSkeleton />
  if (isError) return <QueueError onRetry={() => refetch()} />

  const items = data?.items ?? []
  if (items.length === 0) return <EmptyQueue type="cranes" />

  return (
    <>
      <StaggerList stagger={0.04} className="flex flex-col gap-2">
        {items.map((crane) => (
          <StaggerItem key={crane.id}>
            <CraneApprovalRow
              crane={crane}
              onApprove={() => approveMutation.mutate(crane.id)}
              onReject={() =>
                setRejectTarget({
                  id: crane.id,
                  label: crane.inventoryNumber
                    ? `${crane.model} · ${crane.inventoryNumber}`
                    : crane.model,
                })
              }
              isPending={approveMutation.isPending && approveMutation.variables === crane.id}
            />
          </StaggerItem>
        ))}
      </StaggerList>

      <RejectDialog
        open={rejectTarget !== null}
        onOpenChange={(v) => {
          if (!v) setRejectTarget(null)
        }}
        entity="crane"
        entityId={rejectTarget?.id ?? null}
        entityLabel={rejectTarget?.label ?? ''}
      />
    </>
  )
}
