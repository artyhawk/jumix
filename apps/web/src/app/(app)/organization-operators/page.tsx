'use client'

import { CraneProfileDrawer } from '@/components/drawers/crane-profile-drawer'
import { OrganizationOperatorDrawer } from '@/components/drawers/organization-operator-drawer'
import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar } from '@/components/ui/filter-bar'
import { FilterChip } from '@/components/ui/filter-chip'
import { LicenseStatusBadge } from '@/components/ui/license-status-badge'
import { SearchInput } from '@/components/ui/search-input'
import { useAuth } from '@/hooks/use-auth'
import type { ApprovalStatus, OperatorHireStatus, OrganizationOperator } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useOrganizationOperatorsInfinite } from '@/lib/hooks/use-organization-operators'
import { useOrganizations } from '@/lib/hooks/use-organizations'
import { Building2, Search, ShieldAlert, Users } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

const APPROVAL_OPTIONS: { value: ApprovalStatus; label: string }[] = [
  { value: 'pending', label: 'Ожидает' },
  { value: 'approved', label: 'Одобрен' },
  { value: 'rejected', label: 'Отклонён' },
]
const HIRE_OPTIONS: { value: OperatorHireStatus; label: string }[] = [
  { value: 'active', label: 'Активен' },
  { value: 'blocked', label: 'Заблокирован' },
  { value: 'terminated', label: 'Уволен' },
]
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

function isApproval(v: string | null): v is ApprovalStatus {
  return v === 'pending' || v === 'approved' || v === 'rejected'
}
function isHire(v: string | null): v is OperatorHireStatus {
  return v === 'active' || v === 'blocked' || v === 'terminated'
}

export default function OrganizationOperatorsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()

  const search = params.get('search') ?? ''
  const approval = isApproval(params.get('approval'))
    ? (params.get('approval') as ApprovalStatus)
    : null
  const hire = isHire(params.get('status')) ? (params.get('status') as OperatorHireStatus) : null
  const orgId = params.get('org')
  const openId = params.get('open')
  const openProfile = params.get('openProfile')

  const [orgSearch, setOrgSearch] = useState('')

  useEffect(() => {
    if (user && user.role !== 'superadmin') router.replace('/')
  }, [user, router])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.replace(qs ? `/organization-operators?${qs}` : '/organization-operators', {
      scroll: false,
    })
  }

  const orgsQuery = useOrganizations({ search: orgSearch || undefined, limit: 20 })
  const orgOptions: ComboboxOption<string>[] = useMemo(
    () =>
      (orgsQuery.data?.items ?? []).map((o) => ({
        value: o.id,
        label: o.name,
        hint: o.bin,
      })),
    [orgsQuery.data],
  )

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useOrganizationOperatorsInfinite({
      search: search || undefined,
      approvalStatus: approval ?? undefined,
      status: hire ?? undefined,
      organizationId: orgId ?? undefined,
      limit: 20,
    })

  const rows = useMemo<OrganizationOperator[]>(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  )

  const orgLookup = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of orgsQuery.data?.items ?? []) map.set(o.id, o.name)
    return map
  }, [orgsQuery.data])

  const columns: DataTableColumn<OrganizationOperator>[] = [
    {
      key: 'name',
      header: 'ФИО',
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
      key: 'org',
      header: 'Организация',
      cell: (h) => (
        <span className="inline-flex items-center gap-1.5 min-w-0 text-text-secondary">
          <Building2 className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          <span className="truncate">{orgLookup.get(h.organizationId) ?? h.organizationId}</span>
        </span>
      ),
    },
    {
      key: 'iin',
      header: 'ИИН',
      cell: (h) => <span className="font-mono-numbers">{h.craneProfile.iin}</span>,
      width: '160px',
    },
    {
      key: 'license',
      header: 'Удостоверение',
      cell: (h) => <LicenseStatusBadge status={h.craneProfile.licenseStatus} />,
      width: '160px',
    },
    {
      key: 'approval',
      header: 'Одобрение',
      cell: (h) => (
        <Badge variant={APPROVAL_VARIANT[h.approvalStatus]}>
          {APPROVAL_LABEL[h.approvalStatus]}
        </Badge>
      ),
      width: '140px',
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (h) => <Badge variant={HIRE_VARIANT[h.status]}>{HIRE_LABEL[h.status]}</Badge>,
      width: '140px',
    },
    {
      key: 'createdAt',
      header: 'Создано',
      cell: (h) => formatRelativeTime(h.createdAt),
      showOnMobile: false,
      muted: true,
      width: '140px',
    },
  ]

  if (!user || user.role !== 'superadmin') return null

  return (
    <PageTransition>
      <PageHeader title="Назначения" subtitle="Наймы крановых к организациям (M:N)" />

      <FilterBar
        search={
          <SearchInput
            value={search}
            onDebouncedChange={(v) => setParam('search', v || null)}
            placeholder="ФИО или ИИН кранового…"
            ariaLabel="Поиск назначений"
          />
        }
      >
        <FilterChip<ApprovalStatus>
          label="Одобрение"
          value={approval}
          options={APPROVAL_OPTIONS}
          onChange={(v) => setParam('approval', v)}
        />
        <FilterChip<OperatorHireStatus>
          label="Статус"
          value={hire}
          options={HIRE_OPTIONS}
          onChange={(v) => setParam('status', v)}
        />
        <div className="md:min-w-[240px]">
          <Combobox<string>
            value={orgId}
            onChange={(v) => setParam('org', v)}
            options={orgOptions}
            onSearchChange={setOrgSearch}
            loading={orgsQuery.isLoading}
            placeholder="Все организации"
            searchPlaceholder="Поиск организации…"
            ariaLabel="Фильтр по организации"
          />
        </div>
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
          mobileSubtitle={(h) => orgLookup.get(h.organizationId) ?? h.organizationId}
          ariaLabel="Список назначений"
          empty={
            search || approval || hire || orgId ? (
              <EmptyState
                icon={Search}
                title="Ничего не найдено"
                description="Попробуйте изменить параметры фильтров"
              />
            ) : (
              <EmptyState
                icon={Users}
                title="Назначений пока нет"
                description="Владельцы организаций подают заявки на найм — вы увидите их здесь."
              />
            )
          }
        />
      )}

      <OrganizationOperatorDrawer
        id={openId}
        onOpenChange={(next) => {
          if (!next) setParam('open', null)
        }}
        organizationName={
          openId
            ? orgLookup.get(rows.find((h) => h.id === openId)?.organizationId ?? '')
            : undefined
        }
        onOpenCraneProfile={(craneProfileId) => {
          const next = new URLSearchParams(params.toString())
          next.delete('open')
          next.set('openProfile', craneProfileId)
          router.replace(`/organization-operators?${next.toString()}`, { scroll: false })
        }}
      />
      <CraneProfileDrawer
        id={openProfile}
        onOpenChange={(next) => {
          if (!next) setParam('openProfile', null)
        }}
      />
    </PageTransition>
  )
}
