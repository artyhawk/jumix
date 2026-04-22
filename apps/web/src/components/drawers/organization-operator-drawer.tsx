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
import type { ApprovalStatus, OperatorHireStatus, OrganizationOperator } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import {
  useApproveOrganizationOperator,
  useOrganizationOperator,
} from '@/lib/hooks/use-organization-operators'
import { formatKzPhoneDisplay } from '@/lib/phone-format'
import { ArrowRight, Building2, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DetailRow } from './detail-row'

interface Props {
  id: string | null
  onOpenChange: (open: boolean) => void
  organizationName?: string
  onOpenCraneProfile?: (craneProfileId: string) => void
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

const HIRE_VARIANT: Record<OperatorHireStatus, 'active' | 'blocked' | 'terminated'> = {
  active: 'active',
  blocked: 'blocked',
  terminated: 'terminated',
}
const HIRE_LABEL: Record<OperatorHireStatus, string> = {
  active: 'Активен',
  blocked: 'Заблокирован',
  terminated: 'Уволен',
}

const AVAILABILITY_LABEL: Record<'free' | 'busy' | 'on_shift', string> = {
  free: 'Свободен',
  busy: 'Занят',
  on_shift: 'На смене',
}

export function OrganizationOperatorDrawer({
  id,
  onOpenChange,
  organizationName,
  onOpenCraneProfile,
}: Props) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const query = useOrganizationOperator(id)
  const approve = useApproveOrganizationOperator()
  const hire = query.data

  const handleApprove = async () => {
    if (!hire) return
    try {
      await approve.mutateAsync(hire.id)
      toast.success('Назначение одобрено')
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось одобрить', { description: message })
    }
  }

  const fullName = hire
    ? [hire.craneProfile.lastName, hire.craneProfile.firstName, hire.craneProfile.patronymic]
        .filter(Boolean)
        .join(' ')
    : ''

  return (
    <>
      <DrawerRoot open={id !== null} onOpenChange={onOpenChange}>
        <DrawerContent aria-describedby={undefined}>
          <DrawerHeader className="pr-12">
            <DrawerTitle>{hire ? fullName : 'Назначение'}</DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            {query.isPending ? (
              <OrganizationOperatorDrawerSkeleton />
            ) : query.isError ? (
              <OrganizationOperatorDrawerError />
            ) : hire ? (
              <OrganizationOperatorDrawerBody
                hire={hire}
                organizationName={organizationName}
                onOpenCraneProfile={onOpenCraneProfile}
              />
            ) : null}
          </DrawerBody>
          {hire?.approvalStatus === 'pending' ? (
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
        entity="hire"
        entityId={hire?.id ?? null}
        entityLabel={fullName}
      />
    </>
  )
}

function OrganizationOperatorDrawerBody({
  hire,
  organizationName,
  onOpenCraneProfile,
}: {
  hire: OrganizationOperator
  organizationName?: string
  onOpenCraneProfile?: (craneProfileId: string) => void
}) {
  const cp = hire.craneProfile
  const fullName = [cp.lastName, cp.firstName, cp.patronymic].filter(Boolean).join(' ')
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Avatar size="xl" src={cp.avatarUrl} name={fullName} userId={cp.id} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <Badge variant={APPROVAL_VARIANT[hire.approvalStatus]}>
            {APPROVAL_LABEL[hire.approvalStatus]}
          </Badge>
          <Badge variant={HIRE_VARIANT[hire.status]}>{HIRE_LABEL[hire.status]}</Badge>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <span className="truncate">{fullName}</span>
        <ArrowRight
          className="size-3.5 shrink-0 text-text-tertiary"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="inline-flex min-w-0 items-center gap-1 truncate">
          <Building2 className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          {organizationName ?? hire.organizationId}
        </span>
      </div>
      {hire.approvalStatus === 'rejected' && hire.rejectionReason ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-danger/25 bg-danger/10 p-3 text-sm text-danger">
          <ShieldAlert className="size-4 shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden />
          <span>{hire.rejectionReason}</span>
        </div>
      ) : null}
      <dl className="flex flex-col">
        <DetailRow label="ИИН" mono>
          {cp.iin}
        </DetailRow>
        <DetailRow label="Удостоверение">
          <LicenseStatusBadge status={cp.licenseStatus} />
        </DetailRow>
        {hire.phone ? (
          <DetailRow label="Телефон" mono>
            {formatKzPhoneDisplay(hire.phone)}
          </DetailRow>
        ) : null}
        {hire.availability ? (
          <DetailRow label="Доступность">{AVAILABILITY_LABEL[hire.availability]}</DetailRow>
        ) : null}
        {hire.hiredAt ? (
          <DetailRow label="Принят">{formatRelativeTime(hire.hiredAt)}</DetailRow>
        ) : null}
        {hire.terminatedAt ? (
          <DetailRow label="Уволен">{formatRelativeTime(hire.terminatedAt)}</DetailRow>
        ) : null}
        <DetailRow label="Создано">{formatRelativeTime(hire.createdAt)}</DetailRow>
      </dl>
      {onOpenCraneProfile ? (
        <Button
          variant="ghost"
          onClick={() => onOpenCraneProfile(cp.id)}
          className="w-full justify-between md:w-auto md:justify-center"
        >
          Открыть профиль крановщика
          <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}

function OrganizationOperatorDrawerSkeleton() {
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

function OrganizationOperatorDrawerError() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
      <div className="text-sm text-text-secondary">Не удалось загрузить назначение</div>
    </div>
  )
}
