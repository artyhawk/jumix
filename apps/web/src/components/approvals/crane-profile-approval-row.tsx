'use client'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { CraneProfile } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'

interface Props {
  profile: CraneProfile
  onApprove: () => void
  onReject: () => void
  isPending?: boolean
}

export function CraneProfileApprovalRow({ profile, onApprove, onReject, isPending }: Props) {
  const fullName = [profile.lastName, profile.firstName, profile.patronymic]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="group flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-layer-2 border border-border-subtle hover:border-border-default rounded-[10px] p-4 transition-colors">
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <Avatar size="lg" src={profile.avatarUrl} name={fullName} userId={profile.userId} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{fullName}</div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span className="font-mono-numbers">{profile.iin}</span>
            <span>·</span>
            <span>{formatRelativeTime(profile.createdAt)}</span>
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
