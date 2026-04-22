'use client'

import { OrganizationDrawer } from '@/components/drawers/organization-drawer'
import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { CreateOrganizationDialog } from '@/components/organizations/create-organization-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { FilterBar } from '@/components/ui/filter-bar'
import { FilterChip } from '@/components/ui/filter-chip'
import { SearchInput } from '@/components/ui/search-input'
import { useAuth } from '@/hooks/use-auth'
import type { Organization, OrganizationStatus } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useOrganizationsInfinite } from '@/lib/hooks/use-organizations'
import { formatKzPhoneDisplay } from '@/lib/phone-format'
import { Plus, ShieldAlert } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

const STATUS_OPTIONS: { value: OrganizationStatus; label: string }[] = [
  { value: 'active', label: 'Активные' },
  { value: 'suspended', label: 'Приостановленные' },
  { value: 'archived', label: 'В архиве' },
]
const STATUS_VARIANT: Record<OrganizationStatus, 'active' | 'inactive' | 'terminated'> = {
  active: 'active',
  suspended: 'inactive',
  archived: 'terminated',
}
const STATUS_LABEL: Record<OrganizationStatus, string> = {
  active: 'Активна',
  suspended: 'Приостановлена',
  archived: 'В архиве',
}

function isOrgStatus(v: string | null): v is OrganizationStatus {
  return v !== null && (STATUS_OPTIONS as { value: string }[]).some((o) => o.value === v)
}

export default function OrganizationsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()

  const search = params.get('search') ?? ''
  const status = isOrgStatus(params.get('status'))
    ? (params.get('status') as OrganizationStatus)
    : null
  const openId = params.get('open')

  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (user && user.role !== 'superadmin') router.replace('/')
  }, [user, router])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.replace(qs ? `/organizations?${qs}` : '/organizations', { scroll: false })
  }

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useOrganizationsInfinite({
      search: search || undefined,
      status: status ?? undefined,
      limit: 20,
    })

  const rows = useMemo<Organization[]>(() => data?.pages.flatMap((p) => p.items) ?? [], [data])

  const columns: DataTableColumn<Organization>[] = [
    { key: 'name', header: 'Название', cell: (o) => o.name },
    {
      key: 'bin',
      header: 'БИН',
      cell: (o) => <span className="font-mono-numbers">{o.bin}</span>,
      width: '160px',
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (o) => <Badge variant={STATUS_VARIANT[o.status]}>{STATUS_LABEL[o.status]}</Badge>,
      width: '160px',
    },
    {
      key: 'contact',
      header: 'Контакт',
      cell: (o) =>
        o.contactName || o.contactPhone ? (
          <div className="flex flex-col">
            {o.contactName ? <span>{o.contactName}</span> : null}
            {o.contactPhone ? (
              <span className="text-xs text-text-tertiary font-mono-numbers">
                {formatKzPhoneDisplay(o.contactPhone)}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
      muted: true,
    },
    {
      key: 'createdAt',
      header: 'Создана',
      cell: (o) => formatRelativeTime(o.createdAt),
      showOnMobile: false,
      muted: true,
      width: '140px',
    },
  ]

  if (!user || user.role !== 'superadmin') return null

  return (
    <PageTransition>
      <PageHeader
        title="Организации"
        subtitle="Все зарегистрированные компании на платформе"
        action={
          <Button
            variant="primary"
            onClick={() => setCreateOpen(true)}
            className="w-full md:w-auto"
          >
            <Plus className="size-4" strokeWidth={1.5} aria-hidden />
            Новая организация
          </Button>
        }
      />

      <FilterBar
        search={
          <SearchInput
            value={search}
            onDebouncedChange={(v) => setParam('search', v || null)}
            placeholder="Поиск по названию или БИН…"
            ariaLabel="Поиск организаций"
          />
        }
      >
        <FilterChip<OrganizationStatus>
          label="Статус"
          value={status}
          options={STATUS_OPTIONS}
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
          rowKey={(o) => o.id}
          onRowClick={(o) => setParam('open', o.id)}
          loading={isLoading}
          hasMore={hasNextPage}
          loadingMore={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          mobileTitle={(o) => o.name}
          mobileSubtitle={(o) => <span className="font-mono-numbers">{o.bin}</span>}
          ariaLabel="Список организаций"
          empty={
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="text-sm text-text-secondary">
                {search || status ? 'Ничего не найдено по фильтрам' : 'Организаций пока нет'}
              </div>
            </div>
          }
        />
      )}

      <OrganizationDrawer
        id={openId}
        onOpenChange={(next) => {
          if (!next) setParam('open', null)
        }}
      />
      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageTransition>
  )
}
