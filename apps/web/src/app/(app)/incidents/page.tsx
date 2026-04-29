'use client'

import { IncidentDrawer } from '@/components/drawers/incident-drawer'
import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar } from '@/components/ui/filter-bar'
import { FilterChip } from '@/components/ui/filter-chip'
import { useAuth } from '@/hooks/use-auth'
import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  IncidentWithRelations,
} from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useOwnerIncidentsInfinite } from '@/lib/hooks/use-incidents'
import {
  INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABELS,
} from '@jumix/shared'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'

const SEVERITY_VARIANT: Record<IncidentSeverity, 'inactive' | 'pending' | 'rejected'> = {
  info: 'inactive',
  warning: 'pending',
  critical: 'rejected',
}
const STATUS_VARIANT: Record<IncidentStatus, 'pending' | 'active' | 'approved' | 'rejected'> = {
  submitted: 'pending',
  acknowledged: 'active',
  resolved: 'approved',
  escalated: 'rejected',
}

const SEVERITY_OPTIONS = INCIDENT_SEVERITIES.map((s) => ({
  value: s,
  label: INCIDENT_SEVERITY_LABELS[s],
}))
const STATUS_OPTIONS = INCIDENT_STATUSES.map((s) => ({
  value: s,
  label: INCIDENT_STATUS_LABELS[s],
}))
const TYPE_OPTIONS = INCIDENT_TYPES.map((t) => ({
  value: t,
  label: INCIDENT_TYPE_LABELS[t],
}))

function isSeverity(v: string | null): v is IncidentSeverity {
  return v !== null && (INCIDENT_SEVERITIES as readonly string[]).includes(v)
}
function isStatus(v: string | null): v is IncidentStatus {
  return v !== null && (INCIDENT_STATUSES as readonly string[]).includes(v)
}
function isType(v: string | null): v is IncidentType {
  return v !== null && (INCIDENT_TYPES as readonly string[]).includes(v)
}

export default function IncidentsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()

  const severityRaw = params.get('severity')
  const severity: IncidentSeverity | null = isSeverity(severityRaw) ? severityRaw : null
  const statusRaw = params.get('status')
  const status: IncidentStatus | null = isStatus(statusRaw) ? statusRaw : null
  const typeRaw = params.get('type')
  const type: IncidentType | null = isType(typeRaw) ? typeRaw : null
  const openId = params.get('open')

  useEffect(() => {
    if (user && user.role !== 'owner' && user.role !== 'superadmin') router.replace('/')
  }, [user, router])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.replace(qs ? `/incidents?${qs}` : '/incidents', { scroll: false })
  }

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useOwnerIncidentsInfinite({
      severity: severity ?? undefined,
      status: status ?? undefined,
      type: type ?? undefined,
      limit: 20,
    })

  const rows = useMemo<IncidentWithRelations[]>(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  )

  const columns: DataTableColumn<IncidentWithRelations>[] = [
    {
      key: 'severity',
      header: 'Серьёзность',
      cell: (i) => (
        <Badge variant={SEVERITY_VARIANT[i.severity]}>{INCIDENT_SEVERITY_LABELS[i.severity]}</Badge>
      ),
      width: '160px',
    },
    {
      key: 'type',
      header: 'Тип',
      cell: (i) => INCIDENT_TYPE_LABELS[i.type],
      width: '180px',
    },
    {
      key: 'description',
      header: 'Описание',
      cell: (i) => <span className="line-clamp-1 block">{i.description}</span>,
    },
    {
      key: 'reporter',
      header: 'Крановой',
      cell: (i) => i.reporter.name,
      width: '180px',
      muted: true,
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (i) => (
        <Badge variant={STATUS_VARIANT[i.status]}>{INCIDENT_STATUS_LABELS[i.status]}</Badge>
      ),
      width: '160px',
    },
    {
      key: 'reportedAt',
      header: 'Когда',
      cell: (i) => formatRelativeTime(i.reportedAt),
      width: '140px',
      showOnMobile: false,
      muted: true,
    },
  ]

  if (!user || (user.role !== 'owner' && user.role !== 'superadmin')) return null

  return (
    <PageTransition>
      <PageHeader
        title="Происшествия"
        subtitle={
          user.role === 'owner'
            ? 'Сообщения от крановых о неисправностях, нарушениях ТБ и инцидентах'
            : 'Все происшествия по платформе'
        }
      />

      <FilterBar>
        <FilterChip<IncidentSeverity>
          label="Серьёзность"
          value={severity}
          options={SEVERITY_OPTIONS}
          onChange={(v) => setParam('severity', v)}
        />
        <FilterChip<IncidentStatus>
          label="Статус"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => setParam('status', v)}
        />
        <FilterChip<IncidentType>
          label="Тип"
          value={type}
          options={TYPE_OPTIONS}
          onChange={(v) => setParam('type', v)}
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
          rowKey={(i) => i.id}
          onRowClick={(i) => setParam('open', i.id)}
          loading={isLoading}
          hasMore={hasNextPage}
          loadingMore={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          mobileTitle={(i) => INCIDENT_TYPE_LABELS[i.type]}
          mobileSubtitle={(i) => i.description}
          ariaLabel="Список происшествий"
          empty={
            severity || status || type ? (
              <EmptyState
                icon={AlertTriangle}
                title="Ничего не найдено"
                description="Попробуйте изменить параметры фильтров"
              />
            ) : (
              <EmptyState
                icon={AlertTriangle}
                title="Происшествий пока нет"
                description="Когда крановые начнут сообщать о неисправностях или инцидентах, они появятся здесь."
              />
            )
          }
        />
      )}

      <IncidentDrawer
        id={openId}
        onOpenChange={(next) => {
          if (!next) setParam('open', null)
        }}
      />
    </PageTransition>
  )
}
