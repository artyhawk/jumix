'use client'

import { CraneProfileDrawer } from '@/components/drawers/crane-profile-drawer'
import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar } from '@/components/ui/filter-bar'
import { FilterChip } from '@/components/ui/filter-chip'
import { LicenseStatusBadge } from '@/components/ui/license-status-badge'
import { SearchInput } from '@/components/ui/search-input'
import { useAuth } from '@/hooks/use-auth'
import type { ApprovalStatus, CraneProfile, LicenseStatus } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useCraneProfilesInfinite } from '@/lib/hooks/use-crane-profiles'
import { HardHat, Search, ShieldAlert } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'

const APPROVAL_OPTIONS: { value: ApprovalStatus; label: string }[] = [
  { value: 'pending', label: 'Ожидает' },
  { value: 'approved', label: 'Одобрен' },
  { value: 'rejected', label: 'Отклонён' },
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

const LICENSE_OPTIONS: { value: LicenseStatus; label: string }[] = [
  { value: 'valid', label: 'Действителен' },
  { value: 'expiring_soon', label: 'Истекает' },
  { value: 'expiring_critical', label: 'Истекает скоро' },
  { value: 'expired', label: 'Истёк' },
  { value: 'missing', label: 'Отсутствует' },
]

function isApproval(v: string | null): v is ApprovalStatus {
  return v === 'pending' || v === 'approved' || v === 'rejected'
}
function isLicense(v: string | null): v is LicenseStatus {
  return (
    v === 'valid' ||
    v === 'expiring_soon' ||
    v === 'expiring_critical' ||
    v === 'expired' ||
    v === 'missing'
  )
}

export default function CraneProfilesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()

  const search = params.get('search') ?? ''
  const approval = isApproval(params.get('approval'))
    ? (params.get('approval') as ApprovalStatus)
    : null
  const license = isLicense(params.get('license')) ? (params.get('license') as LicenseStatus) : null
  const openId = params.get('open')

  useEffect(() => {
    if (user && user.role !== 'superadmin') router.replace('/')
  }, [user, router])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.replace(qs ? `/crane-profiles?${qs}` : '/crane-profiles', { scroll: false })
  }

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useCraneProfilesInfinite({
      search: search || undefined,
      approvalStatus: approval ?? undefined,
      limit: 20,
    })

  const rows = useMemo<CraneProfile[]>(() => {
    const all = data?.pages.flatMap((p) => p.items) ?? []
    if (!license) return all
    return all.filter((p) => p.licenseStatus === license)
  }, [data, license])

  const columns: DataTableColumn<CraneProfile>[] = [
    {
      key: 'name',
      header: 'ФИО',
      cell: (p) => {
        const name = [p.lastName, p.firstName, p.patronymic].filter(Boolean).join(' ')
        return (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar size="sm" src={p.avatarUrl} name={name} userId={p.userId} />
            <span className="truncate">{name}</span>
          </div>
        )
      },
    },
    {
      key: 'iin',
      header: 'ИИН',
      cell: (p) => <span className="font-mono-numbers">{p.iin}</span>,
      width: '160px',
    },
    {
      key: 'approval',
      header: 'Одобрение',
      cell: (p) => (
        <Badge variant={APPROVAL_VARIANT[p.approvalStatus]}>
          {APPROVAL_LABEL[p.approvalStatus]}
        </Badge>
      ),
      width: '140px',
    },
    {
      key: 'license',
      header: 'Удостоверение',
      cell: (p) => <LicenseStatusBadge status={p.licenseStatus} />,
      width: '160px',
    },
    {
      key: 'createdAt',
      header: 'Создан',
      cell: (p) => formatRelativeTime(p.createdAt),
      showOnMobile: false,
      muted: true,
      width: '140px',
    },
  ]

  if (!user || user.role !== 'superadmin') return null

  return (
    <PageTransition>
      <PageHeader title="Крановщики" subtitle="Глобальная база identity — ортогонально найму" />

      <FilterBar
        search={
          <SearchInput
            value={search}
            onDebouncedChange={(v) => setParam('search', v || null)}
            placeholder="ФИО или ИИН…"
            ariaLabel="Поиск крановщиков"
          />
        }
      >
        <FilterChip<ApprovalStatus>
          label="Одобрение"
          value={approval}
          options={APPROVAL_OPTIONS}
          onChange={(v) => setParam('approval', v)}
        />
        <FilterChip<LicenseStatus>
          label="Удостоверение"
          value={license}
          options={LICENSE_OPTIONS}
          onChange={(v) => setParam('license', v)}
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
          rowKey={(p) => p.id}
          onRowClick={(p) => setParam('open', p.id)}
          loading={isLoading}
          hasMore={hasNextPage}
          loadingMore={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          mobileTitle={(p) => [p.lastName, p.firstName, p.patronymic].filter(Boolean).join(' ')}
          mobileSubtitle={(p) => <span className="font-mono-numbers">{p.iin}</span>}
          ariaLabel="Список крановщиков"
          empty={
            search || approval || license ? (
              <EmptyState
                icon={Search}
                title="Ничего не найдено"
                description="Попробуйте изменить параметры фильтров"
              />
            ) : (
              <EmptyState
                icon={HardHat}
                title="Крановщиков пока нет"
                description="Новые профили появятся здесь после регистрации через мобильное приложение."
              />
            )
          }
        />
      )}

      <CraneProfileDrawer
        id={openId}
        onOpenChange={(next) => {
          if (!next) setParam('open', null)
        }}
      />
    </PageTransition>
  )
}
