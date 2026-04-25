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
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/use-auth'
import { isAppError } from '@/lib/api/errors'
import type { IncidentSeverity, IncidentStatus, IncidentWithRelations } from '@/lib/api/types'
import { formatRuDate } from '@/lib/format/date'
import { formatRelativeTime } from '@/lib/format/time'
import {
  useAcknowledgeIncident,
  useDeEscalateIncident,
  useEscalateIncident,
  useIncident,
  useResolveIncident,
} from '@/lib/hooks/use-incidents'
import { formatKzPhoneDisplay } from '@/lib/phone-format'
import {
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
} from '@jumix/shared'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  Clock,
  MapPin,
  ShieldAlert,
  TrendingDown,
  UserCircle2,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

interface Props {
  id: string | null
  onOpenChange: (open: boolean) => void
}

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

/**
 * Incident detail drawer (M6, ADR 0008). Read-only сводка + действия per
 * status:
 *   - submitted    → Подтвердить (acknowledge) | Эскалировать
 *   - acknowledged → Решено (resolve с inline notes) | Эскалировать
 *   - escalated    → Решено (только superadmin) | Снять эскалацию (superadmin)
 *   - resolved     → footer скрыт (terminal)
 *
 * Owner: только в scope своей org. Superadmin: везде.
 */
export function IncidentDrawer({ id, onOpenChange }: Props) {
  const query = useIncident(id)
  const incident = query.data

  return (
    <DrawerRoot open={id !== null} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader className="pr-12">
          <DrawerTitle>
            {incident ? INCIDENT_TYPE_LABELS[incident.type] : 'Происшествие'}
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          {query.isPending ? (
            <IncidentDrawerSkeleton />
          ) : query.isError ? (
            <IncidentDrawerError />
          ) : incident ? (
            <IncidentDrawerBody incident={incident} />
          ) : null}
        </DrawerBody>
        {incident ? <IncidentDrawerActions incident={incident} /> : null}
      </DrawerContent>
    </DrawerRoot>
  )
}

function IncidentDrawerBody({ incident }: { incident: IncidentWithRelations }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Hero: severity + type badges + reported time */}
      <div className="flex items-center gap-3">
        <span
          className={
            incident.severity === 'critical'
              ? 'inline-flex size-14 items-center justify-center rounded-full bg-danger/10 text-danger'
              : incident.severity === 'warning'
                ? 'inline-flex size-14 items-center justify-center rounded-full bg-warning/10 text-warning'
                : 'inline-flex size-14 items-center justify-center rounded-full bg-layer-3 text-text-secondary'
          }
        >
          <AlertTriangle className="size-7" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={SEVERITY_VARIANT[incident.severity]}>
              {INCIDENT_SEVERITY_LABELS[incident.severity]}
            </Badge>
            <Badge variant={STATUS_VARIANT[incident.status]}>
              {INCIDENT_STATUS_LABELS[incident.status]}
            </Badge>
          </div>
          <span className="flex items-center gap-1 text-xs text-text-tertiary">
            <Clock className="size-3" strokeWidth={1.5} aria-hidden />
            <span>
              {formatRuDate(incident.reportedAt)} · {formatRelativeTime(incident.reportedAt)}
            </span>
          </span>
        </div>
      </div>

      {/* Description */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Описание</h3>
        <p className="rounded-md border border-layer-3 bg-layer-2 p-3 text-sm text-text-primary whitespace-pre-line">
          {incident.description}
        </p>
      </section>

      {/* Photos */}
      {incident.photos.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text-primary">
            Фото ({incident.photos.length})
          </h3>
          <ul className="grid grid-cols-3 gap-2">
            {incident.photos.map((photo) => (
              <li key={photo.id} className="aspect-square">
                {photo.url ? (
                  <a
                    href={photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block size-full overflow-hidden rounded-md border border-layer-3 hover:border-brand-500/40 transition-colors"
                  >
                    <img
                      src={photo.url}
                      alt={`Фото ${photo.id}`}
                      className="size-full object-cover"
                    />
                  </a>
                ) : (
                  <div className="flex size-full items-center justify-center rounded-md border border-layer-3 bg-layer-2 text-xs text-text-tertiary">
                    Загрузка…
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Reporter + relations */}
      <dl className="flex flex-col">
        <DetailRow label="Крановщик">
          <span className="inline-flex items-center gap-1 text-text-primary">
            <UserCircle2 className="size-4" strokeWidth={1.5} aria-hidden />
            {incident.reporter.name}
          </span>
          <div className="text-xs text-text-tertiary mt-1">
            {formatKzPhoneDisplay(incident.reporter.phone)}
          </div>
        </DetailRow>
        {incident.shift ? (
          <DetailRow label="Смена">
            <Link
              href={`/sites?shift=${incident.shift.id}`}
              className="inline-flex items-center gap-1 text-text-primary hover:text-brand-400 transition-colors"
            >
              {formatRuDate(incident.shift.startedAt)} ·{' '}
              {formatRelativeTime(incident.shift.startedAt)}
              <ArrowRight className="size-3.5 text-text-tertiary" strokeWidth={1.5} aria-hidden />
            </Link>
          </DetailRow>
        ) : null}
        {incident.site ? (
          <DetailRow label="Объект">
            <Link
              href={`/sites?open=${incident.site.id}`}
              className="inline-flex items-center gap-1 text-text-primary hover:text-brand-400 transition-colors"
            >
              <MapPin className="size-4" strokeWidth={1.5} aria-hidden />
              {incident.site.name}
              <ArrowRight className="size-3.5 text-text-tertiary" strokeWidth={1.5} aria-hidden />
            </Link>
          </DetailRow>
        ) : null}
        {incident.crane ? (
          <DetailRow label="Кран">
            <Link
              href={`/my-cranes?open=${incident.crane.id}`}
              className="inline-flex items-center gap-1 text-text-primary hover:text-brand-400 transition-colors"
            >
              {incident.crane.model}
              {incident.crane.inventoryNumber ? ` · ${incident.crane.inventoryNumber}` : ''}
              <ArrowRight className="size-3.5 text-text-tertiary" strokeWidth={1.5} aria-hidden />
            </Link>
          </DetailRow>
        ) : null}
        {incident.latitude !== null && incident.longitude !== null ? (
          <DetailRow label="Координаты" mono>
            {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
          </DetailRow>
        ) : null}
      </dl>

      {/* Timeline */}
      {incident.acknowledgedAt || incident.resolvedAt ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text-primary">Хронология</h3>
          <ul className="flex flex-col gap-1.5 text-sm text-text-secondary">
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-text-tertiary" aria-hidden />
              <span>Подано · {formatRelativeTime(incident.reportedAt)}</span>
            </li>
            {incident.acknowledgedAt ? (
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                <span>Принято в работу · {formatRelativeTime(incident.acknowledgedAt)}</span>
              </li>
            ) : null}
            {incident.resolvedAt ? (
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                <span>
                  Решено · {formatRelativeTime(incident.resolvedAt)}
                  {incident.resolutionNotes ? (
                    <span className="block mt-0.5 text-xs text-text-tertiary">
                      «{incident.resolutionNotes}»
                    </span>
                  ) : null}
                </span>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function IncidentDrawerActions({ incident }: { incident: IncidentWithRelations }) {
  const { user } = useAuth()
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveNotes, setResolveNotes] = useState('')
  const [escalateOpen, setEscalateOpen] = useState(false)
  const [escalateNotes, setEscalateNotes] = useState('')

  const ack = useAcknowledgeIncident()
  const resolve = useResolveIncident()
  const escalate = useEscalateIncident()
  const deEscalate = useDeEscalateIncident()

  if (!user) return null

  const isSuperadmin = user.role === 'superadmin'
  const isOwnerInScope = user.role === 'owner' && incident.organizationId === user.organizationId

  if (!isSuperadmin && !isOwnerInScope) return null
  if (incident.status === 'resolved') return null

  const run = async (
    fn: () => Promise<unknown>,
    successMsg: string,
    errorMsg: string,
  ): Promise<void> => {
    try {
      await fn()
      toast.success(successMsg)
      setResolveOpen(false)
      setResolveNotes('')
      setEscalateOpen(false)
      setEscalateNotes('')
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error(errorMsg, { description: message })
    }
  }

  if (resolveOpen) {
    return (
      <DrawerFooter className="flex-col items-stretch gap-2">
        <Textarea
          value={resolveNotes}
          onChange={(e) => setResolveNotes(e.target.value)}
          placeholder="Опишите решение (необязательно)"
          maxLength={1000}
          rows={3}
          autoFocus
        />
        <div className="flex flex-col-reverse md:flex-row gap-2 md:justify-end">
          <Button
            variant="ghost"
            onClick={() => setResolveOpen(false)}
            className="w-full md:w-auto"
          >
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              run(
                () =>
                  resolve.mutateAsync({
                    id: incident.id,
                    notes: resolveNotes.trim() || undefined,
                  }),
                'Происшествие закрыто',
                'Не удалось закрыть',
              )
            }
            loading={resolve.isPending}
            className="w-full md:w-auto"
          >
            <CheckCheck className="size-4" strokeWidth={1.5} aria-hidden />
            Закрыть
          </Button>
        </div>
      </DrawerFooter>
    )
  }

  if (escalateOpen) {
    return (
      <DrawerFooter className="flex-col items-stretch gap-2">
        <Textarea
          value={escalateNotes}
          onChange={(e) => setEscalateNotes(e.target.value)}
          placeholder="Причина эскалации (необязательно)"
          maxLength={1000}
          rows={3}
          autoFocus
        />
        <div className="flex flex-col-reverse md:flex-row gap-2 md:justify-end">
          <Button
            variant="ghost"
            onClick={() => setEscalateOpen(false)}
            className="w-full md:w-auto"
          >
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              run(
                () =>
                  escalate.mutateAsync({
                    id: incident.id,
                    notes: escalateNotes.trim() || undefined,
                  }),
                'Эскалировано суперадмину',
                'Не удалось эскалировать',
              )
            }
            loading={escalate.isPending}
            className="w-full md:w-auto"
          >
            <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden />
            Эскалировать
          </Button>
        </div>
      </DrawerFooter>
    )
  }

  return (
    <DrawerFooter className="flex-col-reverse md:flex-row md:justify-end">
      {/* submitted: ack + escalate */}
      {incident.status === 'submitted' ? (
        <>
          <Button
            variant="ghost"
            onClick={() => setEscalateOpen(true)}
            className="w-full md:w-auto"
          >
            <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden />
            Эскалировать
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              run(() => ack.mutateAsync(incident.id), 'Принято в работу', 'Не удалось принять')
            }
            loading={ack.isPending}
            className="w-full md:w-auto"
          >
            <CheckCheck className="size-4" strokeWidth={1.5} aria-hidden />
            Подтвердить
          </Button>
        </>
      ) : null}
      {/* acknowledged: escalate (owner) + resolve */}
      {incident.status === 'acknowledged' ? (
        <>
          {!isSuperadmin ? (
            <Button
              variant="ghost"
              onClick={() => setEscalateOpen(true)}
              className="w-full md:w-auto"
            >
              <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden />
              Эскалировать
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={() => setResolveOpen(true)}
            className="w-full md:w-auto"
          >
            <CheckCheck className="size-4" strokeWidth={1.5} aria-hidden />
            Закрыть
          </Button>
        </>
      ) : null}
      {/* escalated: superadmin может resolve OR de-escalate; owner — read-only baner */}
      {incident.status === 'escalated' ? (
        isSuperadmin ? (
          <>
            <Button
              variant="ghost"
              onClick={() =>
                run(
                  () => deEscalate.mutateAsync(incident.id),
                  'Эскалация снята',
                  'Не удалось снять',
                )
              }
              loading={deEscalate.isPending}
              className="w-full md:w-auto"
            >
              <TrendingDown className="size-4" strokeWidth={1.5} aria-hidden />
              Снять эскалацию
            </Button>
            <Button
              variant="primary"
              onClick={() => setResolveOpen(true)}
              className="w-full md:w-auto"
            >
              <CheckCheck className="size-4" strokeWidth={1.5} aria-hidden />
              Закрыть
            </Button>
          </>
        ) : (
          <span className="w-full md:w-auto text-sm text-text-tertiary">
            Эскалировано — ожидает решения суперадмина
          </span>
        )
      ) : null}
    </DrawerFooter>
  )
}

function IncidentDrawerSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="flex flex-col gap-3">
        {['r1', 'r2', 'r3'].map((k) => (
          <Skeleton key={k} className="h-8 w-full" />
        ))}
      </div>
    </div>
  )
}

function IncidentDrawerError() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
      <div className="text-sm text-text-secondary">Не удалось загрузить происшествие</div>
    </div>
  )
}
