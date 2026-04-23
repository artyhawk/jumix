'use client'

import { OrganizationOperatorDrawer } from '@/components/drawers/organization-operator-drawer'
import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { FilterBar } from '@/components/ui/filter-bar'
import { FilterChip } from '@/components/ui/filter-chip'
import { LicenseStatusBadge } from '@/components/ui/license-status-badge'
import { SearchInput } from '@/components/ui/search-input'
import { useAuth } from '@/hooks/use-auth'
import type { OperatorHireStatus, OrganizationOperator } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useOrganizationOperatorsInfinite } from '@/lib/hooks/use-organization-operators'
import { HardHat, ShieldAlert } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'

const HIRE_OPTIONS: { value: OperatorHireStatus; label: string }[] = [
  { value: 'active', label: 'Активные' },
  { value: 'blocked', label: 'Заблокированные' },
  { value: 'terminated', label: 'Уволенные' },
]

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

function isHire(v: string | null): v is OperatorHireStatus {
  return v === 'active' || v === 'blocked' || v === 'terminated'
}

/**
 * Owner management страница: approved memberships своей org. Pending hires —
 * в `/hire-requests`; rejected скрыты в MVP (backlog).
 *
 * Backend scopes по ctx.organizationId для owner — organizationId в query
 * НЕ передаём. approvalStatus='approved' хардкодом — этот route о management,
 * не о workflow.
 */
export default function MyOperatorsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()

  const search = params.get('search') ?? ''
  const hire = isHire(params.get('status')) ? (params.get('status') as OperatorHireStatus) : null
  const openId = params.get('open')

  useEffect(() => {
    if (user && user.role !== 'owner') router.replace('/')
  }, [user, router])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.replace(qs ? `/my-operators?${qs}` : '/my-operators', { scroll: false })
  }

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useOrganizationOperatorsInfinite({
      search: search || undefined,
      approvalStatus: 'approved',
      status: hire ?? undefined,
      limit: 20,
    })

  const rows = useMemo<OrganizationOperator[]>(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  )

  const columns: DataTableColumn<OrganizationOperator>[] = [
    {
      key: 'operator',
      header: 'Крановщик',
      cell: (h) => {
        const cp = h.craneProfile
        const name = [cp.lastName, cp.firstName, cp.patronymic].filter(Boolean).join(' ')
        return (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar size="sm" src={cp.avatarUrl} name={name} userId={cp.id} />
            <span className="truncate">{name}</span>
          </div>
        )
      },
    },
    {
      key: 'iin',
      header: 'ИИН',
      cell: (h) => <span className="font-mono-numbers">{h.craneProfile.iin}</span>,
      width: '160px',
      showOnMobile: false,
    },
    {
      key: 'license',
      header: 'Удостоверение',
      cell: (h) => <LicenseStatusBadge status={h.craneProfile.licenseStatus} />,
      width: '160px',
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (h) => <Badge variant={HIRE_VARIANT[h.status]}>{HIRE_LABEL[h.status]}</Badge>,
      width: '140px',
    },
    {
      key: 'hiredAt',
      header: 'Принят',
      cell: (h) =>
        h.hiredAt ? formatRelativeTime(h.hiredAt) : <span className="text-text-tertiary">—</span>,
      showOnMobile: false,
      muted: true,
      width: '140px',
    },
  ]

  if (!user || user.role !== 'owner') return null

  return (
    <PageTransition>
      <PageHeader
        title="Мои операторы"
        subtitle={
          rows.length > 0
            ? `${rows.length} ${rows.length === 1 ? 'работник' : 'работников'}`
            : 'Нет нанятых крановщиков'
        }
      />

      <FilterBar
        search={
          <SearchInput
            value={search}
            onDebouncedChange={(v) => setParam('search', v || null)}
            placeholder="ФИО или ИИН…"
            ariaLabel="Поиск операторов"
          />
        }
      >
        <FilterChip<OperatorHireStatus>
          label="Статус"
          value={hire}
          options={HIRE_OPTIONS}
          onChange={(v) => setParam('status', v)}
        />
      </FilterBar>

      {isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
          <div className="text-sm text-text-secondary">Не удалось загрузить список</div>
          <Button variant="ghost" onClick={() => refetch()}>
            Повторить
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(h) => h.id}
          onRowClick={(h) => setParam('open', h.id)}
          loading={isLoading}
          hasMore={hasNextPage}
          loadingMore={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          mobileTitle={(h) =>
            [h.craneProfile.lastName, h.craneProfile.firstName, h.craneProfile.patronymic]
              .filter(Boolean)
              .join(' ')
          }
          mobileSubtitle={(h) => h.craneProfile.iin}
          ariaLabel="Список операторов"
          empty={
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <HardHat className="size-8 text-text-tertiary" strokeWidth={1.5} aria-hidden />
              <div className="text-sm text-text-secondary">
                {search || hire
                  ? 'Ничего не найдено по фильтрам'
                  : 'У вас пока нет нанятых крановщиков'}
              </div>
              {!search && !hire ? (
                <Button variant="primary" onClick={() => router.push('/hire-requests?create=true')}>
                  Нанять крановщика
                </Button>
              ) : null}
            </div>
          }
        />
      )}

      <OrganizationOperatorDrawer
        id={openId}
        onOpenChange={(next) => {
          if (!next) setParam('open', null)
        }}
      />
    </PageTransition>
  )
}
