'use client'

import { BaseMap } from '@/components/map/base-map'
import { CranesLayer } from '@/components/map/cranes-layer'
import { LiveCranesLayer } from '@/components/map/live-cranes-layer'
import { DEFAULT_CENTER } from '@/components/map/map-style'
import { SitesLayer } from '@/components/map/sites-layer'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { ActiveShiftLocation, Crane, Site } from '@/lib/api/types'
import { useCranes } from '@/lib/hooks/use-cranes'
import { useLatestLocations, useOwnerShifts } from '@/lib/hooks/use-shifts'
import { useSites } from '@/lib/hooks/use-sites'
import { ArrowRight, MapPin } from 'lucide-react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

/**
 * Left dashboard pane для owner'а — карта активных объектов + live-позиции
 * кранов на активных сменах (M5-c) поверх static-cranes фоллбэка.
 *
 * Merge-логика: для кранов, у которых сейчас идёт смена, показываем live
 * marker по GPS-координатам (LiveCranesLayer). Для approved+active кранов
 * без активной смены — старый static-маркер на site (CranesLayer). Так мы
 * избегаем двойных маркеров и сохраняем visibility для парка вне смен.
 *
 * Click → site (sites page), crane (my-cranes), live-crane → shift drawer.
 */
export function OwnerSitesMap() {
  const router = useRouter()
  const sitesQuery = useSites({ status: 'active', limit: 50 })
  const cranesQuery = useCranes({ approvalStatus: 'approved', status: 'active', limit: 100 })
  const liveQuery = useLatestLocations({})
  const [map, setMap] = useState<MapLibreMap | null>(null)

  const sites = sitesQuery.data?.items ?? []
  const cranes = cranesQuery.data?.items ?? []
  const liveLocations = liveQuery.data?.items ?? []

  // Exclude cranes that have a live shift — их показывает LiveCranesLayer.
  const staticCranes = useMemo(() => {
    const liveCraneIds = new Set(liveLocations.map((l) => l.craneId))
    return cranes.filter((c) => !liveCraneIds.has(c.id))
  }, [cranes, liveLocations])

  const initialCenter = useMemo<[number, number]>(() => {
    const first = sites[0]
    if (!first) return DEFAULT_CENTER
    return [first.longitude, first.latitude]
  }, [sites])

  const handleSiteClick = (site: Site) => {
    router.push(`/sites?open=${site.id}`)
  }
  const handleCraneClick = (crane: Crane) => {
    router.push(`/my-cranes?open=${crane.id}`)
  }
  const handleLiveClick = (loc: ActiveShiftLocation) => {
    router.push(`/sites?shift=${loc.shiftId}`)
  }

  return (
    <Card variant="default" className="flex flex-col gap-3 p-0 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-layer-3 text-text-secondary">
            <MapPin className="size-4" strokeWidth={1.5} aria-hidden />
          </span>
          <h2 className="text-base font-semibold text-text-primary">Карта объектов</h2>
        </div>
        <Link
          href="/sites"
          className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          Все
          <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
        </Link>
      </header>

      <div className="relative h-[420px]">
        {sitesQuery.isLoading ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : sitesQuery.isError ? (
          <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
            Не удалось загрузить объекты
          </div>
        ) : sites.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-4">
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-layer-3 border border-border-subtle">
              <MapPin className="size-5 text-text-tertiary" strokeWidth={1.5} aria-hidden />
            </span>
            <p className="text-sm text-text-secondary">Активных объектов пока нет</p>
            <Link
              href="/sites?create=true"
              className="text-sm font-medium text-brand-500 hover:underline"
            >
              Создать первый объект
            </Link>
          </div>
        ) : (
          <>
            <BaseMap initialCenter={initialCenter} onReady={setMap} className="absolute inset-0" />
            <SitesLayer map={map} sites={sites} onSiteClick={handleSiteClick} />
            <CranesLayer
              map={map}
              sites={sites}
              cranes={staticCranes}
              onCraneClick={handleCraneClick}
            />
            <LiveCranesLayer
              map={map}
              locations={liveLocations}
              onLocationClick={handleLiveClick}
            />
          </>
        )}

        <MapLegend liveCount={liveLocations.length} staticCount={staticCranes.length} />
      </div>
    </Card>
  )
}

/**
 * Небольшая legend в правом-нижнем углу — показывает что означают tone'ы.
 * Только когда на карте есть live markers (иначе просто визуальный шум).
 */
function MapLegend({ liveCount, staticCount }: { liveCount: number; staticCount: number }) {
  if (liveCount === 0) {
    // Используем useOwnerShifts только чтобы понять, есть ли вообще active
    // смены — иначе скрываем legend полностью чтобы не шуметь.
    return <ActiveShiftsHint staticCount={staticCount} />
  }
  return (
    <div className="absolute bottom-2 right-2 flex flex-col gap-1 rounded-md border border-border-subtle bg-layer-2/95 backdrop-blur px-2 py-1.5 text-[10px] text-text-secondary shadow-lg">
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full bg-success" aria-hidden />
        <span>На объекте</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full bg-danger" aria-hidden />
        <span>Вне геозоны</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full bg-warning" aria-hidden />
        <span>GPS утерян &gt; 10 мин</span>
      </div>
    </div>
  )
}

/**
 * Если live-смен нет но есть static cranes — простой hint в corner'е про то,
 * что GPS активируется когда начнётся смена.
 */
function ActiveShiftsHint({ staticCount }: { staticCount: number }) {
  const shiftsQuery = useOwnerShifts({ status: 'live', limit: 1 })
  const hasActive = (shiftsQuery.data?.items.length ?? 0) > 0
  if (hasActive || staticCount === 0) return null
  return (
    <div className="absolute bottom-2 right-2 rounded-md border border-border-subtle bg-layer-2/95 backdrop-blur px-2 py-1.5 text-[10px] text-text-tertiary shadow-lg">
      Нет активных смен сейчас
    </div>
  )
}
