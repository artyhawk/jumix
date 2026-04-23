'use client'

import { DetailRow } from '@/components/drawers/detail-row'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { ApprovalStatus, CraneProfile } from '@/lib/api/types'
import { formatKzPhoneDisplay } from '@/lib/phone-format'

interface Props {
  profile: CraneProfile
}

const APPROVAL_VARIANT: Record<ApprovalStatus, 'pending' | 'approved' | 'rejected'> = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
}
const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: 'Ожидает одобрения',
  approved: 'Профиль одобрен',
  rejected: 'Профиль отклонён',
}

/**
 * Identity card на /me (B3-UI-4). Read-only для MVP (edit — backlog, требует
 * re-approval flow). Показывает full DTO из /me/status: avatar + ФИО +
 * ИИН + phone + approval badge. Rejection reason surfaced если есть.
 */
export function MeIdentityCard({ profile }: Props) {
  const fullName = [profile.lastName, profile.firstName, profile.patronymic]
    .filter(Boolean)
    .join(' ')
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar size="xl" src={profile.avatarUrl} name={fullName} userId={profile.id} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold text-text-primary">{fullName}</div>
          <Badge variant={APPROVAL_VARIANT[profile.approvalStatus]} className="mt-1.5">
            {APPROVAL_LABEL[profile.approvalStatus]}
          </Badge>
        </div>
      </div>

      <dl className="flex flex-col">
        <DetailRow label="ИИН" mono>
          {profile.iin}
        </DetailRow>
        <DetailRow label="Телефон" mono>
          {formatKzPhoneDisplay(profile.phone)}
        </DetailRow>
      </dl>

      {profile.approvalStatus === 'rejected' && profile.rejectionReason ? (
        <div className="rounded-[10px] border border-danger/25 bg-danger/10 p-3 text-sm text-danger">
          <div className="font-medium">Причина отклонения</div>
          <div className="mt-1 text-text-secondary">{profile.rejectionReason}</div>
        </div>
      ) : null}
    </Card>
  )
}
