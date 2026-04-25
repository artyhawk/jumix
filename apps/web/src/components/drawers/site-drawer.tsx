'use client'

import { DetailRow } from '@/components/drawers/detail-row'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { isAppError } from '@/lib/api/errors'
import type { Site, SiteStatus } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useOwnerShifts } from '@/lib/hooks/use-shifts'
import { useActivateSite, useArchiveSite, useCompleteSite, useSite } from '@/lib/hooks/use-sites'
import {
  Archive,
  CheckCheck,
  ChevronRight,
  Clock,
  MapPin,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

interface Props {
  id: string | null
  onOpenChange: (open: boolean) => void
}

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

/**
 * Detail-drawer для site. Footer-actions зависят от роли (owner/superadmin
 * могут менять статус) и текущего состояния:
 *   - active    → [Сдать] / [Архивировать]
 *   - completed → [Вернуть в работу] / [Архивировать]
 *   - archived  → [Восстановить]
 *
 * Архивирование подтверждается inline (toggle confirmation), не через
 * отдельный dialog — чтобы не нагружать модалки одна-поверх-другой.
 */
export function SiteDrawer({ id, onOpenChange }: Props) {
  const { user } = useAuth()
  const query = useSite(id)
  const complete = useCompleteSite()
  const archive = useArchiveSite()
  const activate = useActivateSite()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const site = query.data
  const canMutate = user?.role === 'owner' || user?.role === 'superadmin'

  const run = async (fn: () => Promise<Site>, successMsg: string, errorMsg: string) => {
    try {
      await fn()
      toast.success(successMsg)
      setConfirmArchive(false)
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error(errorMsg, { description: message })
    }
  }

  const isPending = complete.isPending || archive.isPending || activate.isPending

  return (
    <DrawerRoot open={id !== null} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader className="pr-12">
          <DrawerTitle>{site ? site.name : 'Объект'}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          {query.isPending ? (
            <SiteDrawerSkeleton />
          ) : query.isError ? (
            <SiteDrawerError />
          ) : site ? (
            <SiteDrawerBody site={site} />
          ) : null}
        </DrawerBody>

        {site && canMutate ? (
          <DrawerFooter className="flex-col-reverse md:flex-row">
            {confirmArchive ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmArchive(false)}
                  disabled={isPending}
                  className="w-full md:w-auto"
                >
                  Отмена
                </Button>
                <Button
                  variant="primary"
                  onClick={() =>
                    run(
                      () => archive.mutateAsync(site.id),
                      'Объект архивирован',
                      'Не удалось архивировать',
                    )
                  }
                  loading={archive.isPending}
                  className="w-full md:w-auto"
                >
                  Архивировать
                </Button>
              </>
            ) : site.status === 'active' ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmArchive(true)}
                  disabled={isPending}
                  className="w-full md:w-auto"
                >
                  <Archive className="size-4" strokeWidth={1.5} aria-hidden />
                  Архивировать
                </Button>
                <Button
                  variant="primary"
                  onClick={() =>
                    run(
                      () => complete.mutateAsync(site.id),
                      'Объект помечен как сданный',
                      'Не удалось завершить',
                    )
                  }
                  loading={complete.isPending}
                  className="w-full md:w-auto"
                >
                  <CheckCheck className="size-4" strokeWidth={1.5} aria-hidden />
                  Сдать
                </Button>
              </>
            ) : site.status === 'completed' ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmArchive(true)}
                  disabled={isPending}
                  className="w-full md:w-auto"
                >
                  <Archive className="size-4" strokeWidth={1.5} aria-hidden />
                  Архивировать
                </Button>
                <Button
                  variant="primary"
                  onClick={() =>
                    run(
                      () => activate.mutateAsync(site.id),
                      'Объект возвращён в работу',
                      'Не удалось активировать',
                    )
                  }
                  loading={activate.isPending}
                  className="w-full md:w-auto"
                >
                  <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden />В работу
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                onClick={() =>
                  run(
                    () => activate.mutateAsync(site.id),
                    'Объект восстановлен',
                    'Не удалось активировать',
                  )
                }
                loading={activate.isPending}
                className="w-full md:w-auto"
              >
                <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden />
                Восстановить
              </Button>
            )}
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </DrawerRoot>
  )
}

function SiteDrawerBody({ site }: { site: Site }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
          <MapPin className="size-7" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <Badge variant={STATUS_VARIANT[site.status]}>{STATUS_LABEL[site.status]}</Badge>
        </div>
      </div>

      <dl className="flex flex-col">
        <DetailRow label="Название">{site.name}</DetailRow>
        {site.address ? <DetailRow label="Адрес">{site.address}</DetailRow> : null}
        <DetailRow label="Координаты" mono>
          {site.latitude.toFixed(5)}, {site.longitude.toFixed(5)}
        </DetailRow>
        <DetailRow label="Радиус геозоны" mono>
          {site.radiusM} м
        </DetailRow>
        {site.notes ? <DetailRow label="Заметки">{site.notes}</DetailRow> : null}
        <DetailRow label="Создан">{formatRelativeTime(site.createdAt)}</DetailRow>
      </dl>

      <SiteActiveShifts siteId={site.id} />
    </div>
  )
}

function SiteActiveShifts({ siteId }: { siteId: string }) {
  const { data, isPending, isError } = useOwnerShifts({ siteId, status: 'live', limit: 20 })
  const items = data?.items ?? []
  const router = useRouter()
  const params = useSearchParams()

  const openShift = useCallback(
    (shiftId: string) => {
      const next = new URLSearchParams(params.toString())
      next.set('shift', shiftId)
      router.replace(`?${next.toString()}`, { scroll: false })
    },
    [params, router],
  )

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Текущие смены</h3>
      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <p className="text-sm text-text-tertiary">Не удалось загрузить смены</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-tertiary">Нет активных смен</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((shift) => (
            <li key={shift.id}>
              <button
                type="button"
                onClick={() => openShift(shift.id)}
                className="flex w-full flex-col gap-1 rounded-md border border-layer-3 bg-layer-2 p-3 text-left text-sm hover:border-brand-500/40 hover:bg-layer-3 transition-colors"
                aria-label={`Открыть смену ${shift.operator.lastName} ${shift.operator.firstName}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-text-primary">
                    {shift.operator.lastName} {shift.operator.firstName}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={shift.status === 'paused' ? 'pending' : 'active'}>
                      {shift.status === 'paused' ? 'Перерыв' : 'На смене'}
                    </Badge>
                    <ChevronRight
                      className="size-3.5 text-text-tertiary"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </div>
                </div>
                <div className="text-text-tertiary">
                  {shift.crane.model}
                  {shift.crane.inventoryNumber ? ` · ${shift.crane.inventoryNumber}` : ''}
                </div>
                <div className="flex items-center gap-1 text-xs text-text-tertiary">
                  <Clock className="size-3" strokeWidth={1.5} aria-hidden />
                  <span>Начало: {formatRelativeTime(shift.startedAt)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SiteDrawerSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-[22px] w-24" />
      </div>
      <div className="flex flex-col gap-3">
        {['r1', 'r2', 'r3', 'r4', 'r5'].map((k) => (
          <Skeleton key={k} className="h-8 w-full" />
        ))}
      </div>
    </div>
  )
}

function SiteDrawerError() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
      <div className="text-sm text-text-secondary">Не удалось загрузить объект</div>
    </div>
  )
}
