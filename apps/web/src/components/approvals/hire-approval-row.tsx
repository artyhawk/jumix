'use client'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { OrganizationOperator } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { ArrowRight, Building2 } from 'lucide-react'

interface Props {
  hire: OrganizationOperator
  organizationName?: string
  onApprove: () => void
  onReject: () => void
  isPending?: boolean
}

export function HireApprovalRow({ hire, organizationName, onApprove, onReject, isPending }: Props) {
  const cp = hire.craneProfile
  const fullName = [cp.lastName, cp.firstName, cp.patronymic].filter(Boolean).join(' ')

  return (
    <div className="group flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-layer-2 border border-border-subtle hover:border-border-default rounded-[10px] p-4 transition-colors">
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <Avatar size="lg" src={cp.avatarUrl} name={fullName} userId={cp.id} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <span className="truncate">{fullName}</span>
            <ArrowRight
              className="size-3.5 text-text-tertiary shrink-0"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="inline-flex items-center gap-1 text-text-secondary truncate">
              <Building2 className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              {organizationName ?? hire.organizationId}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span className="font-mono-numbers">{cp.iin}</span>
            <span>·</span>
            <span>{formatRelativeTime(hire.createdAt)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="primary"
          size="sm"
          onClick={onApprove}
          disabled={isPending}
          className="flex-1 md:flex-none"
        >
          Одобрить
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReject}
          disabled={isPending}
          className="flex-1 md:flex-none"
        >
          Отклонить
        </Button>
      </div>
    </div>
  )
}
