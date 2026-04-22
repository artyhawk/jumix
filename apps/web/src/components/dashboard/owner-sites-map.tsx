'use client'

import { BaseMap } from '@/components/map/base-map'
import { CranesLayer } from '@/components/map/cranes-layer'
import { DEFAULT_CENTER } from '@/components/map/map-style'
import { SitesLayer } from '@/components/map/sites-layer'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Crane, Site } from '@/lib/api/types'
import { useCranes } from '@/lib/hooks/use-cranes'
import { useSites } from '@/lib/hooks/use-sites'
import { ArrowRight, MapPin } from 'lucide-react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

/**
 * Left dashboard pane для owner'а — карта активных объектов организации +
 * назначенные на них approved-краны (layer поверх). Клик по site → `/sites?open=<id>`;
 * клик по cranes-маркеру → `/my-cranes?open=<id>`. Центрируется на первом
 * site'е если есть, иначе дефолт (Астана).
 */
export function OwnerSitesMap() {
  const router = useRouter()
  const sitesQuery = useSites({ status: 'active', limit: 50 })
  const cranesQuery = useCranes({ approvalStatus: 'approved', status: 'active', limit: 100 })
  const [map, setMap] = useState<MapLibreMap | null>(null)

  const sites = sitesQuery.data?.items ?? []
  const cranes = cranesQuery.data?.items ?? []

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
            <CranesLayer map={map} sites={sites} cranes={cranes} onCraneClick={handleCraneClick} />
          </>
        )}
      </div>
    </Card>
  )
}
