'use client'

import { SiteDrawer } from '@/components/drawers/site-drawer'
import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { CreateSiteDialog } from '@/components/sites/create-site-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar } from '@/components/ui/filter-bar'
import { FilterChip } from '@/components/ui/filter-chip'
import { SearchInput } from '@/components/ui/search-input'
import { useAuth } from '@/hooks/use-auth'
import type { Site, SiteStatus } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useSitesInfinite } from '@/lib/hooks/use-sites'
import { MapPin, Plus, Search, ShieldAlert } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'

const STATUS_OPTIONS: { value: SiteStatus; label: string }[] = [
  { value: 'active', label: 'Активные' },
  { value: 'completed', label: 'Сданные' },
  { value: 'archived', label: 'В архиве' },
]
const STATUS_VARIANT: Record<SiteStatus, 'active' | 'inactive' | 'terminated'> = {
  active: 'active',
  completed: 'inactive',
  archived: 'terminated',
}
const STATUS_LABEL: Record<SiteStatus, string> = {
  active: 'Активен',
  completed: 'Сдан',
  archived: 'В архиве',
}

function isSiteStatus(v: string | null): v is SiteStatus {
  return v === 'active' || v === 'completed' || v === 'archived'
}

export default function SitesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()

  const search = params.get('search') ?? ''
  const status = isSiteStatus(params.get('status')) ? (params.get('status') as SiteStatus) : null
  const openId = params.get('open')
  const createOpen = params.get('create') === 'true'

  useEffect(() => {
    if (user && user.role !== 'owner' && user.role !== 'superadmin') router.replace('/')
  }, [user, router])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.replace(qs ? `/sites?${qs}` : '/sites', { scroll: false })
  }

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useSitesInfinite({
      search: search || undefined,
      status: status ?? undefined,
      limit: 20,
    })

  const rows = useMemo<Site[]>(() => data?.pages.flatMap((p) => p.items) ?? [], [data])

  const columns: DataTableColumn<Site>[] = [
    {
      key: 'name',
      header: 'Название',
      cell: (s) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-500/10 text-brand-400">
            <MapPin size={16} strokeWidth={1.5} aria-hidden />
          </span>
          <span className="truncate">{s.name}</span>
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Адрес',
      cell: (s) =>
        s.address ? (
          <span className="truncate block">{s.address}</span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
      muted: true,
    },
    {
      key: 'radius',
      header: 'Радиус',
      cell: (s) => <span className="font-mono-numbers">{s.radiusM} м</span>,
      width: '110px',
      align: 'right',
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (s) => <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>,
      width: '140px',
    },
    {
      key: 'createdAt',
      header: 'Создан',
      cell: (s) => formatRelativeTime(s.createdAt),
      width: '140px',
      showOnMobile: false,
      muted: true,
    },
  ]

  if (!user || (user.role !== 'owner' && user.role !== 'superadmin')) return null

  const canCreate = user.role === 'owner'

  return (
    <PageTransition>
      <PageHeader
        title="Объекты"
        subtitle={
          user.role === 'owner'
            ? 'Строительные объекты вашей организации'
            : 'Строительные объекты всех организаций'
        }
        action={
          canCreate ? (
            <Button
              variant="primary"
              onClick={() => setParam('create', 'true')}
              className="w-full md:w-auto"
            >
              <Plus className="size-4" strokeWidth={1.5} aria-hidden />
              Новый объект
            </Button>
          ) : null
        }
      />

      <FilterBar
        search={
          <SearchInput
            value={search}
            onDebouncedChange={(v) => setParam('search', v || null)}
            placeholder="Название или адрес…"
            ariaLabel="Поиск объектов"
          />
        }
      >
        <FilterChip<SiteStatus>
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
          rowKey={(s) => s.id}
          onRowClick={(s) => setParam('open', s.id)}
          loading={isLoading}
          hasMore={hasNextPage}
          loadingMore={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          mobileTitle={(s) => s.name}
          mobileSubtitle={(s) =>
            s.address ? s.address : <span className="text-text-tertiary">Без адреса</span>
          }
          ariaLabel="Список объектов"
          empty={
            search || status ? (
              <EmptyState
                icon={Search}
                title="Ничего не найдено"
                description="Попробуйте изменить параметры фильтров"
              />
            ) : (
              <EmptyState
                icon={MapPin}
                title={canCreate ? 'У вас пока нет объектов' : 'Объектов пока нет'}
                description={
                  canCreate
                    ? 'Создайте первый объект — укажите название и область геозоны на карте.'
                    : undefined
                }
                action={
                  canCreate ? (
                    <Button variant="primary" onClick={() => setParam('create', 'true')}>
                      <Plus className="size-4" strokeWidth={1.5} aria-hidden />
                      Создать объект
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />
      )}

      <SiteDrawer
        id={openId}
        onOpenChange={(next) => {
          if (!next) setParam('open', null)
        }}
      />
      {canCreate ? (
        <CreateSiteDialog
          open={createOpen}
          onOpenChange={(next) => {
            if (!next) setParam('create', null)
          }}
        />
      ) : null}
    </PageTransition>
  )
}
