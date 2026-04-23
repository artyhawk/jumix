'use client'

import { CreateCraneDialog } from '@/components/cranes/create-crane-dialog'
import { CraneDrawer } from '@/components/drawers/crane-drawer'
import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar } from '@/components/ui/filter-bar'
import { FilterChip } from '@/components/ui/filter-chip'
import { SearchInput } from '@/components/ui/search-input'
import { useAuth } from '@/hooks/use-auth'
import type { ApprovalStatus, Crane, CraneOperationalStatus, CraneType } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useCranesInfinite } from '@/lib/hooks/use-cranes'
import { IconCrane } from '@tabler/icons-react'
import { Plus, Search, ShieldAlert } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'

const APPROVAL_OPTIONS: { value: ApprovalStatus; label: string }[] = [
  { value: 'pending', label: 'Ожидает' },
  { value: 'approved', label: 'Одобрен' },
  { value: 'rejected', label: 'Отклонён' },
]
const OP_OPTIONS: { value: CraneOperationalStatus; label: string }[] = [
  { value: 'active', label: 'Рабочий' },
  { value: 'maintenance', label: 'На ремонте' },
  { value: 'retired', label: 'Списан' },
]
const TYPE_OPTIONS: { value: CraneType; label: string }[] = [
  { value: 'tower', label: 'Башенный' },
  { value: 'mobile', label: 'Мобильный' },
  { value: 'crawler', label: 'Гусеничный' },
  { value: 'overhead', label: 'Мостовой' },
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
const OP_VARIANT: Record<CraneOperationalStatus, 'active' | 'inactive' | 'terminated'> = {
  active: 'active',
  maintenance: 'inactive',
  retired: 'terminated',
}
const OP_LABEL: Record<CraneOperationalStatus, string> = {
  active: 'Рабочий',
  maintenance: 'На ремонте',
  retired: 'Списан',
}
const TYPE_LABEL: Record<CraneType, string> = {
  tower: 'Башенный',
  mobile: 'Мобильный',
  crawler: 'Гусеничный',
  overhead: 'Мостовой',
}

function isApproval(v: string | null): v is ApprovalStatus {
  return v === 'pending' || v === 'approved' || v === 'rejected'
}
function isOpStatus(v: string | null): v is CraneOperationalStatus {
  return v === 'active' || v === 'maintenance' || v === 'retired'
}
function isCraneType(v: string | null): v is CraneType {
  return v === 'tower' || v === 'mobile' || v === 'crawler' || v === 'overhead'
}

/**
 * Owner-cabinet: парк собственной организации. Backend уже scopes список по
 * `ctx.organizationId` для role=owner — серверу `organizationId` не передаём.
 */
export default function MyCranesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()

  const search = params.get('search') ?? ''
  const approval = isApproval(params.get('approval'))
    ? (params.get('approval') as ApprovalStatus)
    : null
  const op = isOpStatus(params.get('status'))
    ? (params.get('status') as CraneOperationalStatus)
    : null
  const type = isCraneType(params.get('type')) ? (params.get('type') as CraneType) : null
  const openId = params.get('open')
  const createOpen = params.get('create') === 'true'

  useEffect(() => {
    if (user && user.role !== 'owner') router.replace('/')
  }, [user, router])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.replace(qs ? `/my-cranes?${qs}` : '/my-cranes', { scroll: false })
  }

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useCranesInfinite({
      search: search || undefined,
      approvalStatus: approval ?? 'all',
      status: op ?? undefined,
      limit: 20,
    })

  const rows = useMemo<Crane[]>(() => {
    const all = data?.pages.flatMap((p) => p.items) ?? []
    if (!type) return all
    return all.filter((c) => c.type === type)
  }, [data, type])

  const columns: DataTableColumn<Crane>[] = [
    {
      key: 'model',
      header: 'Модель',
      cell: (c) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-500/10 text-brand-400">
            <IconCrane size={16} stroke={1.5} aria-hidden />
          </span>
          <span className="truncate">{c.model}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Тип',
      cell: (c) => TYPE_LABEL[c.type],
      width: '140px',
    },
    {
      key: 'inventoryNumber',
      header: 'Инв. №',
      cell: (c) =>
        c.inventoryNumber ? (
          <span className="font-mono-numbers">{c.inventoryNumber}</span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
      width: '140px',
      muted: true,
    },
    {
      key: 'capacity',
      header: 'Гр/п, т',
      cell: (c) => <span className="font-mono-numbers">{c.capacityTon}</span>,
      width: '100px',
      align: 'right',
    },
    {
      key: 'approval',
      header: 'Одобрение',
      cell: (c) => (
        <Badge variant={APPROVAL_VARIANT[c.approvalStatus]}>
          {APPROVAL_LABEL[c.approvalStatus]}
        </Badge>
      ),
      width: '140px',
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (c) => <Badge variant={OP_VARIANT[c.status]}>{OP_LABEL[c.status]}</Badge>,
      width: '140px',
    },
    {
      key: 'createdAt',
      header: 'Создан',
      cell: (c) => formatRelativeTime(c.createdAt),
      showOnMobile: false,
      muted: true,
      width: '140px',
    },
  ]

  if (!user || user.role !== 'owner') return null

  return (
    <PageTransition>
      <PageHeader
        title="Мои краны"
        subtitle="Парк оборудования вашей организации"
        action={
          <Button
            variant="primary"
            onClick={() => setParam('create', 'true')}
            className="w-full md:w-auto"
          >
            <Plus className="size-4" strokeWidth={1.5} aria-hidden />
            Новый кран
          </Button>
        }
      />

      <FilterBar
        search={
          <SearchInput
            value={search}
            onDebouncedChange={(v) => setParam('search', v || null)}
            placeholder="Модель или инв. №…"
            ariaLabel="Поиск кранов"
          />
        }
      >
        <FilterChip<ApprovalStatus>
          label="Одобрение"
          value={approval}
          options={APPROVAL_OPTIONS}
          onChange={(v) => setParam('approval', v)}
        />
        <FilterChip<CraneType>
          label="Тип"
          value={type}
          options={TYPE_OPTIONS}
          onChange={(v) => setParam('type', v)}
        />
        <FilterChip<CraneOperationalStatus>
          label="Состояние"
          value={op}
          options={OP_OPTIONS}
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
          rowKey={(c) => c.id}
          onRowClick={(c) => setParam('open', c.id)}
          loading={isLoading}
          hasMore={hasNextPage}
          loadingMore={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          mobileTitle={(c) => c.model}
          mobileSubtitle={(c) => TYPE_LABEL[c.type]}
          ariaLabel="Список кранов"
          empty={
            search || approval || op || type ? (
              <EmptyState
                icon={Search}
                title="Ничего не найдено"
                description="Попробуйте изменить параметры фильтров"
              />
            ) : (
              <EmptyState
                icon={IconCrane}
                title="У вас пока нет кранов"
                description="Добавьте первый кран — после одобрения платформой он появится в парке."
                action={
                  <Button variant="primary" onClick={() => setParam('create', 'true')}>
                    Добавить первый кран
                  </Button>
                }
              />
            )
          }
        />
      )}

      <CraneDrawer
        id={openId}
        onOpenChange={(next) => {
          if (!next) setParam('open', null)
        }}
      />
      <CreateCraneDialog
        open={createOpen}
        onOpenChange={(next) => {
          if (!next) setParam('create', null)
        }}
      />
    </PageTransition>
  )
}
