'use client'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { LicenseStatusBadge } from '@/components/ui/license-status-badge'
import type { OrganizationOperator } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'

interface Props {
  hire: OrganizationOperator
  onClick: () => void
}

/**
 * Карточка для `/hire-requests` — mobile-first (44px touch, column on phone),
 * desktop row. Rejected-reason не показываем в списке (backlog — separate tab).
 */
export function PendingHireRow({ hire, onClick }: Props) {
  const cp = hire.craneProfile
  const fullName = [cp.lastName, cp.firstName, cp.patronymic].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full min-h-[44px] flex-col items-stretch gap-3 rounded-[10px] border border-border-subtle bg-layer-2 p-4 text-left transition-colors hover:border-border-default md:flex-row md:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar size="md" src={cp.avatarUrl} name={fullName} userId={cp.id} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-primary">{fullName}</div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span className="font-mono-numbers">{cp.iin}</span>
            <span aria-hidden>·</span>
            <span>заявка {formatRelativeTime(hire.createdAt)}</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <LicenseStatusBadge status={cp.licenseStatus} />
        <Badge variant="pending">Ожидает</Badge>
      </div>
    </button>
  )
}
