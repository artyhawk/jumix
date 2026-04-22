'use client'

import { RejectDialog } from '@/components/approvals/reject-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
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
import type {
  ApprovalStatus,
  Crane,
  CraneOperationalStatus,
  CraneType,
  Site,
} from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import {
  useActivateCrane,
  useApproveCrane,
  useAssignCraneToSite,
  useCrane,
  useResubmitCrane,
  useRetireCrane,
  useSetCraneMaintenance,
  useUnassignCraneFromSite,
} from '@/lib/hooks/use-cranes'
import { useSites } from '@/lib/hooks/use-sites'
import { IconCrane } from '@tabler/icons-react'
import { Hammer, Power, RotateCcw, Send, ShieldAlert, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DetailRow } from './detail-row'

interface Props {
  id: string | null
  onOpenChange: (open: boolean) => void
}

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

const TYPE_LABEL: Record<CraneType, string> = {
  tower: 'Башенный',
  mobile: 'Мобильный',
  crawler: 'Гусеничный',
  overhead: 'Мостовой',
}

const OP_STATUS_VARIANT: Record<CraneOperationalStatus, 'active' | 'inactive' | 'terminated'> = {
  active: 'active',
  maintenance: 'inactive',
  retired: 'terminated',
}
const OP_STATUS_LABEL: Record<CraneOperationalStatus, string> = {
  active: 'Рабочий',
  maintenance: 'На ремонте',
  retired: 'Списан',
}

export function CraneDrawer({ id, onOpenChange }: Props) {
  const { user } = useAuth()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [confirmRetire, setConfirmRetire] = useState(false)

  const query = useCrane(id)
  const approve = useApproveCrane()
  const activate = useActivateCrane()
  const setMaintenance = useSetCraneMaintenance()
  const retire = useRetireCrane()
  const resubmit = useResubmitCrane()

  const crane = query.data
  const isOwner =
    user?.role === 'owner' && Boolean(crane) && user.organizationId === crane?.organizationId
  const isSuperadmin = user?.role === 'superadmin'
  const canManage = isOwner || isSuperadmin

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    try {
      await fn()
      toast.success(ok)
      setConfirmRetire(false)
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error(fail, { description: message })
    }
  }

  const handleApprove = () =>
    crane && run(() => approve.mutateAsync(crane.id), 'Кран одобрен', 'Не удалось одобрить')

  const isMutating =
    approve.isPending ||
    activate.isPending ||
    setMaintenance.isPending ||
    retire.isPending ||
    resubmit.isPending

  return (
    <>
      <DrawerRoot open={id !== null} onOpenChange={onOpenChange}>
        <DrawerContent aria-describedby={undefined}>
          <DrawerHeader className="pr-12">
            <DrawerTitle>{crane ? crane.model : 'Кран'}</DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            {query.isPending ? (
              <CraneDrawerSkeleton />
            ) : query.isError ? (
              <CraneDrawerError />
            ) : crane ? (
              <CraneDrawerBody crane={crane} canManage={canManage} />
            ) : null}
          </DrawerBody>

          {crane && crane.approvalStatus === 'pending' && isSuperadmin ? (
            <DrawerFooter className="flex-col-reverse md:flex-row">
              <Button
                variant="ghost"
                onClick={() => setRejectOpen(true)}
                disabled={isMutating}
                className="w-full md:w-auto"
              >
                Отклонить
              </Button>
              <Button
                variant="primary"
                onClick={handleApprove}
                loading={approve.isPending}
                className="w-full md:w-auto"
              >
                Одобрить
              </Button>
            </DrawerFooter>
          ) : crane && crane.approvalStatus === 'rejected' && (isOwner || isSuperadmin) ? (
            <DrawerFooter>
              <Button
                variant="primary"
                onClick={() =>
                  run(
                    () => resubmit.mutateAsync(crane.id),
                    'Заявка отправлена повторно',
                    'Не удалось отправить',
                  )
                }
                loading={resubmit.isPending}
                className="w-full md:w-auto"
              >
                <Send className="size-4" strokeWidth={1.5} aria-hidden />
                Отправить повторно
              </Button>
            </DrawerFooter>
          ) : crane && crane.approvalStatus === 'approved' && canManage ? (
            <DrawerFooter className="flex-col-reverse md:flex-row">
              {confirmRetire ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmRetire(false)}
                    disabled={isMutating}
                    className="w-full md:w-auto"
                  >
                    Отмена
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() =>
                      run(() => retire.mutateAsync(crane.id), 'Кран списан', 'Не удалось списать')
                    }
                    loading={retire.isPending}
                    className="w-full md:w-auto"
                  >
                    Списать
                  </Button>
                </>
              ) : crane.status === 'active' ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmRetire(true)}
                    disabled={isMutating}
                    className="w-full md:w-auto"
                  >
                    <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
                    Списать
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() =>
                      run(
                        () => setMaintenance.mutateAsync(crane.id),
                        'Кран отправлен на ремонт',
                        'Не удалось обновить',
                      )
                    }
                    loading={setMaintenance.isPending}
                    className="w-full md:w-auto"
                  >
                    <Hammer className="size-4" strokeWidth={1.5} aria-hidden />
                    На ремонт
                  </Button>
                </>
              ) : crane.status === 'maintenance' ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmRetire(true)}
                    disabled={isMutating}
                    className="w-full md:w-auto"
                  >
                    <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
                    Списать
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() =>
                      run(
                        () => activate.mutateAsync(crane.id),
                        'Кран снова в работе',
                        'Не удалось активировать',
                      )
                    }
                    loading={activate.isPending}
                    className="w-full md:w-auto"
                  >
                    <Power className="size-4" strokeWidth={1.5} aria-hidden />В работу
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={() =>
                    run(
                      () => activate.mutateAsync(crane.id),
                      'Кран восстановлен',
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
      <RejectDialog
        open={rejectOpen}
        onOpenChange={(next) => {
          setRejectOpen(next)
          if (!next) onOpenChange(false)
        }}
        entity="crane"
        entityId={crane?.id ?? null}
        entityLabel={crane ? `${TYPE_LABEL[crane.type]} · ${crane.model}` : ''}
      />
    </>
  )
}

function CraneDrawerBody({ crane, canManage }: { crane: Crane; canManage: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
          <IconCrane size={28} stroke={1.5} aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <Badge variant={APPROVAL_VARIANT[crane.approvalStatus]}>
            {APPROVAL_LABEL[crane.approvalStatus]}
          </Badge>
          <Badge variant={OP_STATUS_VARIANT[crane.status]}>{OP_STATUS_LABEL[crane.status]}</Badge>
        </div>
      </div>
      {crane.approvalStatus === 'rejected' && crane.rejectionReason ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-danger/25 bg-danger/10 p-3 text-sm text-danger">
          <ShieldAlert className="size-4 shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden />
          <span>{crane.rejectionReason}</span>
        </div>
      ) : null}
      <dl className="flex flex-col">
        <DetailRow label="Тип">{TYPE_LABEL[crane.type]}</DetailRow>
        <DetailRow label="Модель">{crane.model}</DetailRow>
        {crane.inventoryNumber ? (
          <DetailRow label="Инв. №" mono>
            {crane.inventoryNumber}
          </DetailRow>
        ) : null}
        <DetailRow label="Грузоподъёмность" mono>
          {crane.capacityTon} т
        </DetailRow>
        {crane.boomLengthM !== null ? (
          <DetailRow label="Длина стрелы" mono>
            {crane.boomLengthM} м
          </DetailRow>
        ) : null}
        {crane.yearManufactured !== null ? (
          <DetailRow label="Год выпуска" mono>
            {crane.yearManufactured}
          </DetailRow>
        ) : null}
        {crane.notes ? <DetailRow label="Заметки">{crane.notes}</DetailRow> : null}
        <DetailRow label="Создан">{formatRelativeTime(crane.createdAt)}</DetailRow>
      </dl>

      {crane.approvalStatus === 'approved' && crane.status !== 'retired' && canManage ? (
        <AssignmentInline crane={crane} />
      ) : null}
    </div>
  )
}

function AssignmentInline({ crane }: { crane: Crane }) {
  const sitesQuery = useSites({ status: 'active', limit: 100 })
  const assign = useAssignCraneToSite()
  const unassign = useUnassignCraneFromSite()

  const sites: Site[] = sitesQuery.data?.items ?? []
  const options: ComboboxOption<string>[] = sites.map((s) => ({ value: s.id, label: s.name }))
  const isPending = assign.isPending || unassign.isPending

  const onChange = async (next: string | null) => {
    if (next === crane.siteId) return
    try {
      if (next === null) {
        await unassign.mutateAsync(crane.id)
        toast.success('Кран снят с площадки')
      } else {
        await assign.mutateAsync({ id: crane.id, siteId: next })
        toast.success('Кран привязан к площадке')
      }
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось обновить привязку', { description: message })
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
      <div className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Площадка</div>
      <Combobox
        ariaLabel="Площадка крана"
        value={crane.siteId}
        onChange={onChange}
        options={options}
        placeholder="Не привязан"
        emptyText={sitesQuery.isPending ? 'Загрузка…' : 'Нет активных объектов'}
        loading={sitesQuery.isPending}
        disabled={isPending}
      />
    </div>
  )
}

function CraneDrawerSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-[22px] w-24" />
          <Skeleton className="h-[22px] w-28" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((k) => (
          <Skeleton key={k} className="h-8 w-full" />
        ))}
      </div>
    </div>
  )
}

function CraneDrawerError() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
      <div className="text-sm text-text-secondary">Не удалось загрузить кран</div>
    </div>
  )
}
