'use client'

import { MembershipCard } from '@/components/operator/membership-card'
import { EmptyState } from '@/components/ui/empty-state'
import type { MeStatusMembership } from '@/lib/api/types'
import { ArrowRight, Building2 } from 'lucide-react'
import Link from 'next/link'

interface Props {
  memberships: MeStatusMembership[]
}

/**
 * Summary-section на /me (B3-UI-4). Показывает первые 3 memberships + ссылку
 * на /memberships (полный список). Empty state — helpful hint: operator'у
 * нужен owner чтобы подать заявку на найм.
 */
export function MeMembershipsSummary({ memberships }: Props) {
  const active = memberships.filter(
    (m) => m.approvalStatus === 'approved' && m.status === 'active',
  ).length
  const top = memberships.slice(0, 3)
  const extra = memberships.length - top.length

  if (memberships.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Пока нет активных трудоустройств"
        description="Вам нужен владелец организации, который подаст заявку на ваш найм."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">
          Компании
          <span className="ml-2 text-text-tertiary font-normal">
            {active} из {memberships.length} активно
          </span>
        </h3>
        {memberships.length > 3 ? (
          <Link
            href="/memberships"
            className="inline-flex items-center gap-1 text-sm text-brand-400 hover:text-brand-500"
          >
            Все компании
            <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
          </Link>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2" aria-label="Ваши трудоустройства">
        {top.map((m) => (
          <li key={m.id}>
            <MembershipCard membership={m} />
          </li>
        ))}
      </ul>
      {extra > 0 ? (
        <div className="text-xs text-text-tertiary text-center">И ещё {extra}</div>
      ) : null}
    </div>
  )
}
