'use client'

import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { MembershipCard } from '@/components/operator/membership-card'
import { MembershipDrawer } from '@/components/operator/membership-drawer'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useAuth } from '@/hooks/use-auth'
import type { MeStatusMembership } from '@/lib/api/types'
import { useMeStatus } from '@/lib/hooks/use-me'
import { Building2, ShieldAlert } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'

/**
 * Operator list of hires across organizations (B3-UI-4). Read-only —
 * operator не может create/approve/terminate (это owner/superadmin actions).
 *
 * URL-state `?open=<id>` opens MembershipDrawer с extended details.
 */
export default function MembershipsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const status = useMeStatus()

  useEffect(() => {
    if (user && user.role !== 'operator') router.replace('/')
  }, [user, router])

  const openId = params.get('open')

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (id) next.set('open', id)
    else next.delete('open')
    const qs = next.toString()
    router.replace(qs ? `/memberships?${qs}` : '/memberships', { scroll: false })
  }

  const memberships = useMemo<MeStatusMembership[]>(
    () => status.data?.memberships ?? [],
    [status.data],
  )
  const opened = useMemo(
    () => memberships.find((m) => m.id === openId) ?? null,
    [memberships, openId],
  )

  if (!user || user.role !== 'operator') return null

  if (status.isError) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
          <div className="text-sm text-text-secondary">Не удалось загрузить список</div>
          <Button variant="ghost" onClick={() => status.refetch()}>
            Повторить
          </Button>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <PageHeader
        title="Компании"
        subtitle={
          memberships.length > 0
            ? `${memberships.length} ${pluralJobs(memberships.length)}`
            : 'Список ваших трудоустройств'
        }
      />

      {status.isLoading ? (
        <div className="flex flex-col gap-2">
          {['s1', 's2', 's3'].map((k) => (
            <div
              key={k}
              className="h-[110px] rounded-[12px] border border-border-subtle bg-layer-2 animate-[pulse_1.5s_ease-in-out_infinite]"
            />
          ))}
        </div>
      ) : memberships.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Пока нет активных трудоустройств"
          description="Вам нужен владелец организации, который подаст заявку на ваш найм. После одобрения заявки платформой вы сможете выходить на смену."
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Ваши трудоустройства">
          {memberships.map((m) => (
            <li key={m.id}>
              <MembershipCard membership={m} onClick={() => setOpen(m.id)} />
            </li>
          ))}
        </ul>
      )}

      <MembershipDrawer
        membership={opened}
        onOpenChange={(next) => {
          if (!next) setOpen(null)
        }}
      />
    </PageTransition>
  )
}

function pluralJobs(n: number): string {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'трудоустройств'
  if (last === 1) return 'трудоустройство'
  if (last >= 2 && last <= 4) return 'трудоустройства'
  return 'трудоустройств'
}
