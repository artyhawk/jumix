'use client'

import { BaseMap } from '@/components/map/base-map'
import { ShiftPathLayer } from '@/components/map/shift-path-layer'
import { SitesLayer } from '@/components/map/sites-layer'
import { Badge } from '@/components/ui/badge'
import {
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import type { ShiftStatus, ShiftWithRelations, Site } from '@/lib/api/types'
import { formatRuDate } from '@/lib/format/date'
import { computeShiftDurationSeconds, formatDurationHuman } from '@/lib/format/duration'
import { formatRelativeTime } from '@/lib/format/time'
import { useShiftDetail, useShiftPath } from '@/lib/hooks/use-shifts'
import { IconCrane } from '@tabler/icons-react'
import { Activity, ArrowRight, MapPin, ShieldAlert, UserCircle2 } from 'lucide-react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import Link from 'next/link'
import { useState } from 'react'
import { DetailRow } from './detail-row'

interface Props {
  id: string | null
  onOpenChange: (open: boolean) => void
}

const STATUS_VARIANT: Record<ShiftStatus, 'active' | 'inactive' | 'pending'> = {
  active: 'active',
  paused: 'pending',
  ended: 'inactive',
}
const STATUS_LABEL: Record<ShiftStatus, string> = {
  active: 'На смене',
  paused: 'Перерыв',
  ended: 'Завершена',
}

/**
 * Detail-drawer для смены (M5-c). Показывает метаданные + мини-карту с path
 * polyline'ом (если есть pings). Read-only: action'ы смены (pause/resume/end)
 * — только на mobile у самого оператора.
 *
 * Data sources:
 *   - useShiftDetail(id) → metadata + site coords для центрирования карты
 *   - useShiftPath(id) → pings для polyline + start/end markers
 */
export function ShiftDrawer({ id, onOpenChange }: Props) {
  const detail = useShiftDetail(id ?? undefined)
  const shift = detail.data

  return (
    <DrawerRoot open={id !== null} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader className="pr-12">
          <DrawerTitle>{shift ? `Смена · ${shift.crane.model}` : 'Смена'}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          {detail.isPending ? (
            <ShiftDrawerSkeleton />
          ) : detail.isError ? (
            <ShiftDrawerError />
          ) : shift ? (
            <ShiftDrawerBody shift={shift} />
          ) : null}
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  )
}

function ShiftDrawerBody({ shift }: { shift: ShiftWithRelations }) {
  const durationSec = computeShiftDurationSeconds(shift)
  const operatorFullName = [shift.operator.lastName, shift.operator.firstName]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
          <Activity className="size-7" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <Badge variant={STATUS_VARIANT[shift.status]}>{STATUS_LABEL[shift.status]}</Badge>
          <span className="text-xs text-text-tertiary">{formatDurationHuman(durationSec)}</span>
        </div>
      </div>

      <ShiftMapSection shift={shift} />

      <dl className="flex flex-col">
        <DetailRow label="Крановой">
          <Link
            href={`/crane-profiles?open=${shift.craneProfileId}`}
            className="inline-flex items-center gap-1 text-text-primary hover:text-brand-400 transition-colors"
          >
            <UserCircle2 className="size-4" strokeWidth={1.5} aria-hidden />
            {operatorFullName || '—'}
            <ArrowRight className="size-3.5 text-text-tertiary" strokeWidth={1.5} aria-hidden />
          </Link>
        </DetailRow>
        <DetailRow label="Кран">
          <Link
            href={`/my-cranes?open=${shift.craneId}`}
            className="inline-flex items-center gap-1 text-text-primary hover:text-brand-400 transition-colors"
          >
            <IconCrane size={16} stroke={1.5} aria-hidden />
            {shift.crane.model}
            {shift.crane.inventoryNumber ? ` · ${shift.crane.inventoryNumber}` : ''}
            <ArrowRight className="size-3.5 text-text-tertiary" strokeWidth={1.5} aria-hidden />
          </Link>
        </DetailRow>
        <DetailRow label="Объект">
          <Link
            href={`/sites?open=${shift.siteId}`}
            className="inline-flex items-center gap-1 text-text-primary hover:text-brand-400 transition-colors"
          >
            <MapPin className="size-4" strokeWidth={1.5} aria-hidden />
            {shift.site.name}
            <ArrowRight className="size-3.5 text-text-tertiary" strokeWidth={1.5} aria-hidden />
          </Link>
        </DetailRow>
        <DetailRow label="Начало">
          {formatRuDate(shift.startedAt)} · {formatRelativeTime(shift.startedAt)}
        </DetailRow>
        {shift.endedAt ? (
          <DetailRow label="Окончание">
            {formatRuDate(shift.endedAt)} · {formatRelativeTime(shift.endedAt)}
          </DetailRow>
        ) : null}
        {shift.totalPauseSeconds > 0 ? (
          <DetailRow label="Пауза суммарно" mono>
            {formatDurationHuman(shift.totalPauseSeconds)}
          </DetailRow>
        ) : null}
        {shift.notes ? <DetailRow label="Заметки">{shift.notes}</DetailRow> : null}
      </dl>
    </div>
  )
}

/**
 * Mini-map внутри drawer'а с path polyline + site geofence.
 * Высота 240px — компромисс между читаемостью на mobile (full-screen drawer)
 * и плотностью информации в dl-секции ниже.
 */
function ShiftMapSection({ shift }: { shift: ShiftWithRelations }) {
  const path = useShiftPath(shift.id)
  const [map, setMap] = useState<MapLibreMap | null>(null)

  const site: Site = {
    id: shift.site.id,
    organizationId: shift.organizationId,
    name: shift.site.name,
    address: shift.site.address,
    latitude: shift.site.latitude,
    longitude: shift.site.longitude,
    radiusM: shift.site.geofenceRadiusM,
    status: 'active',
    notes: null,
    createdAt: shift.createdAt,
    updatedAt: shift.updatedAt,
  }

  const initialCenter: [number, number] = [shift.site.longitude, shift.site.latitude]
  const pings = path.data?.pings ?? []
  const hasPings = pings.length > 0

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Маршрут</h3>
        {path.isPending ? (
          <span className="text-xs text-text-tertiary">Загрузка…</span>
        ) : hasPings ? (
          <span className="text-xs text-text-tertiary">
            {pings.length} {pings.length === 1 ? 'пинг' : pings.length < 5 ? 'пинга' : 'пингов'}
          </span>
        ) : (
          <span className="text-xs text-text-tertiary">Нет данных GPS</span>
        )}
      </div>
      <div className="relative h-[240px] rounded-md overflow-hidden border border-border-subtle">
        <BaseMap
          initialCenter={initialCenter}
          initialZoom={15}
          onReady={setMap}
          className="absolute inset-0"
        />
        <SitesLayer map={map} sites={[site]} />
        <ShiftPathLayer map={map} pings={pings} />
      </div>
    </section>
  )
}

function ShiftDrawerSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-[240px] w-full rounded-md" />
      <div className="flex flex-col gap-3">
        {['r1', 'r2', 'r3', 'r4'].map((k) => (
          <Skeleton key={k} className="h-8 w-full" />
        ))}
      </div>
    </div>
  )
}

function ShiftDrawerError() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
      <div className="text-sm text-text-secondary">Не удалось загрузить смену</div>
    </div>
  )
}
