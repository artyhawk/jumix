'use client'

import { RejectDialog } from '@/components/approvals/reject-dialog'
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
import { isAppError } from '@/lib/api/errors'
import type { ApprovalStatus, Crane, CraneOperationalStatus, CraneType } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { useApproveCrane, useCrane } from '@/lib/hooks/use-cranes'
import { IconCrane } from '@tabler/icons-react'
import { ShieldAlert } from 'lucide-react'
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
  const [rejectOpen, setRejectOpen] = useState(false)
  const query = useCrane(id)
  const approve = useApproveCrane()
  const crane = query.data

  const handleApprove = async () => {
    if (!crane) return
    try {
      await approve.mutateAsync(crane.id)
      toast.success('Кран одобрен')
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось одобрить', { description: message })
    }
  }

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
              <CraneDrawerBody crane={crane} />
            ) : null}
          </DrawerBody>
          {crane?.approvalStatus === 'pending' ? (
            <DrawerFooter className="flex-col-reverse md:flex-row">
              <Button
                variant="ghost"
                onClick={() => setRejectOpen(true)}
                disabled={approve.isPending}
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

function CraneDrawerBody({ crane }: { crane: Crane }) {
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
