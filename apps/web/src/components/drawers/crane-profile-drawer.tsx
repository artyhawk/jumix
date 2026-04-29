'use client'

import { RejectDialog } from '@/components/approvals/reject-dialog'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from '@/components/ui/drawer'
import { LicenseStatusBadge } from '@/components/ui/license-status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { isAppError } from '@/lib/api/errors'
import type { ApprovalStatus, CraneProfile } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useApproveCraneProfile, useCraneProfile } from '@/lib/hooks/use-crane-profiles'
import { formatKzPhoneDisplay } from '@/lib/phone-format'
import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DetailRow } from './detail-row'

interface Props {
  id: string | null
  onOpenChange: (open: boolean) => void
}

const APPROVAL_VARIANT: Record<ApprovalStatus, 'pending' | 'approved' | 'rejected'> = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
}

const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрен',
  rejected: 'Отклонён',
}

/**
 * Detail-drawer для crane profile. Open-state контролируется извне через `id`.
 * Для pending — кнопки Approve/Reject. Reject переиспользует общий RejectDialog.
 */
export function CraneProfileDrawer({ id, onOpenChange }: Props) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const query = useCraneProfile(id)
  const approve = useApproveCraneProfile()

  const profile = query.data

  const handleApprove = async () => {
    if (!profile) return
    try {
      await approve.mutateAsync(profile.id)
      toast.success('Крановой одобрен')
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось одобрить', { description: message })
    }
  }

  return (
    <>
      <DrawerRoot open={id !== null} onOpenChange={onOpenChange}>
        <DrawerContent aria-describedby={undefined}>
          <DrawerHeader className="pr-12">
            <DrawerTitle>
              {profile
                ? [profile.lastName, profile.firstName, profile.patronymic]
                    .filter(Boolean)
                    .join(' ')
                : 'Крановой'}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            {query.isPending ? (
              <CraneProfileDrawerSkeleton />
            ) : query.isError ? (
              <CraneProfileDrawerError />
            ) : profile ? (
              <CraneProfileDrawerBody profile={profile} />
            ) : null}
          </DrawerBody>
          {profile?.approvalStatus === 'pending' ? (
            <DrawerFooter className="flex-col-reverse md:flex-row">
              <Button
                variant="ghost"
                onClick={() => setRejectOpen(true)}
                disabled={approve.isPending}
                className="w-full md:w-auto"
              >
                Отклонить
              </Button>
              <Button
                variant="primary"
                onClick={handleApprove}
                loading={approve.isPending}
                className="w-full md:w-auto"
              >
                Одобрить
              </Button>
            </DrawerFooter>
          ) : null}
        </DrawerContent>
      </DrawerRoot>
      <RejectDialog
        open={rejectOpen}
        onOpenChange={(next) => {
          setRejectOpen(next)
          if (!next) onOpenChange(false)
        }}
        entity="crane-profile"
        entityId={profile?.id ?? null}
        entityLabel={
          profile
            ? [profile.lastName, profile.firstName, profile.patronymic].filter(Boolean).join(' ')
            : ''
        }
      />
    </>
  )
}

function CraneProfileDrawerBody({ profile }: { profile: CraneProfile }) {
  const fullName = [profile.lastName, profile.firstName, profile.patronymic]
    .filter(Boolean)
    .join(' ')
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Avatar size="xl" src={profile.avatarUrl} name={fullName} userId={profile.userId} />
        <div className="flex flex-col gap-1.5">
          <Badge variant={APPROVAL_VARIANT[profile.approvalStatus]}>
            {APPROVAL_LABEL[profile.approvalStatus]}
          </Badge>
          <LicenseStatusBadge status={profile.licenseStatus} />
        </div>
      </div>
      {profile.approvalStatus === 'rejected' && profile.rejectionReason ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-danger/25 bg-danger/10 p-3 text-sm text-danger">
          <ShieldAlert className="size-4 shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden />
          <span>{profile.rejectionReason}</span>
        </div>
      ) : null}
      <dl className="flex flex-col">
        <DetailRow label="ИИН" mono>
          {profile.iin}
        </DetailRow>
        <DetailRow label="Телефон" mono>
          {formatKzPhoneDisplay(profile.phone)}
        </DetailRow>
        <DetailRow label="Удостоверение">
          <LicenseStatusBadge
            status={profile.licenseStatus}
            enriched
            expiresAt={profile.licenseExpiresAt}
          />
        </DetailRow>
        <DetailRow label="Создан">{formatRelativeTime(profile.createdAt)}</DetailRow>
        {profile.approvedAt ? (
          <DetailRow label="Одобрен">{formatRelativeTime(profile.approvedAt)}</DetailRow>
        ) : null}
        {profile.rejectedAt ? (
          <DetailRow label="Отклонён">{formatRelativeTime(profile.rejectedAt)}</DetailRow>
        ) : null}
      </dl>
    </div>
  )
}

function CraneProfileDrawerSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-[22px] w-24" />
          <Skeleton className="h-[22px] w-28" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {['r1', 'r2', 'r3', 'r4', 'r5'].map((k) => (
          <Skeleton key={k} className="h-8 w-full" />
        ))}
      </div>
    </div>
  )
}

function CraneProfileDrawerError() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
      <div className="text-sm text-text-secondary">Не удалось загрузить кранового</div>
    </div>
  )
}
