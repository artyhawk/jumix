'use client'

import { Badge } from '@/components/ui/badge'
import type { ApprovalStatus, MeStatusMembership, OperatorHireStatus } from '@/lib/api/types'
import { formatRuDate } from '@/lib/format/date'
import { cn } from '@/lib/utils'
import { Building2 } from 'lucide-react'

interface Props {
  membership: MeStatusMembership
  onClick?: () => void
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
 * Membership card для /memberships + embedded в /me summary. Read-only —
 * operator не может create/terminate/approve. Rejection reason critical UX
 * surface (operator понимает почему отклонили).
 *
 * Clickable variant — `<button>` для accessibility, interactive hover border.
 * Non-clickable — `<div>`.
 */
export function MembershipCard({ membership, onClick }: Props) {
  const showOperationalStatus = membership.approvalStatus === 'approved'
  const className = cn(
    'flex w-full items-start gap-3 rounded-[12px] border bg-layer-2 p-4 text-left',
    onClick
      ? 'border-border-subtle transition-colors duration-150 hover:border-border-default cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40'
      : 'border-border-subtle',
  )
  const body = (
    <>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-layer-3 text-text-secondary">
        <Building2 className="size-5" strokeWidth={1.5} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-text-primary">
          {membership.organizationName}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant={APPROVAL_VARIANT[membership.approvalStatus]}>
            {APPROVAL_LABEL[membership.approvalStatus]}
          </Badge>
          {showOperationalStatus ? (
            <Badge variant={HIRE_VARIANT[membership.status]}>{HIRE_LABEL[membership.status]}</Badge>
          ) : null}
        </div>
        <div className="mt-2 text-xs text-text-tertiary">
          {membership.hiredAt
            ? `Принят: ${formatRuDate(membership.hiredAt)}`
            : 'Дата найма не указана'}
          {membership.terminatedAt ? ` · Уволен: ${formatRuDate(membership.terminatedAt)}` : null}
        </div>
        {membership.approvalStatus === 'rejected' && membership.rejectionReason ? (
          <div className="mt-2 text-xs text-danger">
            Причина отклонения: {membership.rejectionReason}
          </div>
        ) : null}
      </div>
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    )
  }
  return <div className={className}>{body}</div>
}
