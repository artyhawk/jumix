'use client'

import { StaggerItem, StaggerList } from '@/components/motion/stagger-list'
import { useApproveCraneProfile, useCraneProfiles } from '@/lib/hooks/use-crane-profiles'
import { useState } from 'react'
import { CraneProfileApprovalRow } from './crane-profile-approval-row'
import { EmptyQueue } from './empty-queue'
import { QueueError } from './queue-error'
import { QueueSkeleton } from './queue-skeleton'
import { RejectDialog } from './reject-dialog'

export function CraneProfilesQueue() {
  const { data, isLoading, isError, refetch } = useCraneProfiles({
    approvalStatus: 'pending',
    limit: 50,
  })
  const approveMutation = useApproveCraneProfile()
  const [rejectTarget, setRejectTarget] = useState<{ id: string; label: string } | null>(null)

  if (isLoading) return <QueueSkeleton />
  if (isError) return <QueueError onRetry={() => refetch()} />

  const items = data?.items ?? []
  if (items.length === 0) return <EmptyQueue type="crane-profiles" />

  return (
    <>
      <StaggerList stagger={0.04} className="flex flex-col gap-2">
        {items.map((profile) => (
          <StaggerItem key={profile.id}>
            <CraneProfileApprovalRow
              profile={profile}
              onApprove={() => approveMutation.mutate(profile.id)}
              onReject={() =>
                setRejectTarget({
                  id: profile.id,
                  label: [profile.lastName, profile.firstName, profile.patronymic]
                    .filter(Boolean)
                    .join(' '),
                })
              }
              isPending={approveMutation.isPending && approveMutation.variables === profile.id}
            />
          </StaggerItem>
        ))}
      </StaggerList>

      <RejectDialog
        open={rejectTarget !== null}
        onOpenChange={(v) => {
          if (!v) setRejectTarget(null)
        }}
        entity="crane-profile"
        entityId={rejectTarget?.id ?? null}
        entityLabel={rejectTarget?.label ?? ''}
      />
    </>
  )
}
