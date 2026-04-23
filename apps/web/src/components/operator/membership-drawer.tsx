'use client'

import { DetailRow } from '@/components/drawers/detail-row'
import { Badge } from '@/components/ui/badge'
import {
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from '@/components/ui/drawer'
import type { ApprovalStatus, MeStatusMembership, OperatorHireStatus } from '@/lib/api/types'
import { formatRuDate } from '@/lib/format/date'
import { Building2, ShieldAlert } from 'lucide-react'

interface Props {
  membership: MeStatusMembership | null
  onOpenChange: (open: boolean) => void
}

const APPROVAL_VARIANT: Record<ApprovalStatus, 'pending' | 'approved' | 'rejected'> = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
}
const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрено',
  rejected: 'Отклонено',
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

/**
 * Drawer с расширенными деталями одного membership (B3-UI-4). Read-only —
 * operator только просматривает. Rejection reason full text surfaced при
 * approvalStatus='rejected'.
 */
export function MembershipDrawer({ membership, onOpenChange }: Props) {
  const open = membership !== null
  return (
    <DrawerRoot open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader className="pr-12">
          <DrawerTitle>{membership?.organizationName ?? 'Трудоустройство'}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>{membership ? <Body membership={membership} /> : null}</DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  )
}

function Body({ membership }: { membership: MeStatusMembership }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-layer-3 text-text-secondary">
          <Building2 className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-text-primary">
            {membership.organizationName}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={APPROVAL_VARIANT[membership.approvalStatus]}>
              {APPROVAL_LABEL[membership.approvalStatus]}
            </Badge>
            {membership.approvalStatus === 'approved' ? (
              <Badge variant={HIRE_VARIANT[membership.status]}>
                {HIRE_LABEL[membership.status]}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {membership.approvalStatus === 'rejected' && membership.rejectionReason ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-danger/25 bg-danger/10 p-3 text-sm text-danger">
          <ShieldAlert className="size-4 shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden />
          <div>
            <div className="font-medium">Причина отклонения</div>
            <div className="mt-1 text-text-secondary">{membership.rejectionReason}</div>
          </div>
        </div>
      ) : null}

      <dl className="flex flex-col">
        {membership.hiredAt ? (
          <DetailRow label="Принят">{formatRuDate(membership.hiredAt)}</DetailRow>
        ) : null}
        {membership.approvedAt ? (
          <DetailRow label="Одобрено">{formatRuDate(membership.approvedAt)}</DetailRow>
        ) : null}
        {membership.rejectedAt ? (
          <DetailRow label="Отклонено">{formatRuDate(membership.rejectedAt)}</DetailRow>
        ) : null}
        {membership.terminatedAt ? (
          <DetailRow label="Уволен">{formatRuDate(membership.terminatedAt)}</DetailRow>
        ) : null}
      </dl>
    </div>
  )
}
