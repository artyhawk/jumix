'use client'

import { EditOrganizationDialog } from '@/components/organizations/edit-organization-dialog'
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
import type { Organization, OrganizationStatus } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import {
  useActivateOrganization,
  useArchiveOrganization,
  useOrganization,
  useSuspendOrganization,
} from '@/lib/hooks/use-organizations'
import { formatKzPhoneDisplay } from '@/lib/phone-format'
import { Archive, Building2, Pencil, Power, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DetailRow } from './detail-row'

interface Props {
  id: string | null
  onOpenChange: (open: boolean) => void
}

const STATUS_VARIANT: Record<OrganizationStatus, 'active' | 'inactive' | 'terminated'> = {
  active: 'active',
  suspended: 'inactive',
  archived: 'terminated',
}
const STATUS_LABEL: Record<OrganizationStatus, string> = {
  active: 'Активна',
  suspended: 'Приостановлена',
  archived: 'В архиве',
}

export function OrganizationDrawer({ id, onOpenChange }: Props) {
  const { user } = useAuth()
  const query = useOrganization(id)
  const suspend = useSuspendOrganization()
  const activate = useActivateOrganization()
  const archive = useArchiveOrganization()
  const org = query.data
  const [editOpen, setEditOpen] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const handleSuspend = async () => {
    if (!org) return
    try {
      await suspend.mutateAsync(org.id)
      toast.success('Организация приостановлена')
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось приостановить', { description: message })
    }
  }

  const handleActivate = async () => {
    if (!org) return
    try {
      await activate.mutateAsync(org.id)
      toast.success('Организация активирована')
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось активировать', { description: message })
    }
  }

  const handleArchive = async () => {
    if (!org) return
    try {
      await archive.mutateAsync(org.id)
      toast.success('Организация отправлена в архив')
      setConfirmArchive(false)
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось архивировать', { description: message })
    }
  }

  const busy = suspend.isPending || activate.isPending || archive.isPending
  const canManage = user?.role === 'superadmin'
  const showFooter = canManage && org && org.status !== 'archived'

  return (
    <>
      <DrawerRoot open={id !== null} onOpenChange={onOpenChange}>
        <DrawerContent aria-describedby={undefined}>
          <DrawerHeader className="pr-12">
            <DrawerTitle>{org ? org.name : 'Организация'}</DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            {query.isPending ? (
              <OrganizationDrawerSkeleton />
            ) : query.isError ? (
              <OrganizationDrawerError />
            ) : org ? (
              <OrganizationDrawerBody org={org} />
            ) : null}
          </DrawerBody>
          {showFooter && org ? (
            confirmArchive ? (
              <DrawerFooter className="flex-col items-start">
                <div className="text-sm text-text-primary">Отправить {org.name} в архив?</div>
                <div className="text-xs text-text-secondary">
                  Архивация — терминальное состояние. Доступ владельцев будет заблокирован.
                </div>
                <div className="flex w-full flex-col-reverse gap-2 md:flex-row md:justify-end">
                  <Button variant="ghost" onClick={() => setConfirmArchive(false)} disabled={busy}>
                    Отмена
                  </Button>
                  <Button variant="danger" onClick={handleArchive} loading={archive.isPending}>
                    Да, архивировать
                  </Button>
                </div>
              </DrawerFooter>
            ) : (
              <DrawerFooter className="flex-col-reverse md:flex-row md:justify-between">
                <div className="flex flex-col-reverse gap-2 md:flex-row">
                  <Button
                    variant="ghost"
                    onClick={() => setEditOpen(true)}
                    disabled={busy}
                    className="w-full md:w-auto"
                  >
                    <Pencil className="size-4" strokeWidth={1.5} aria-hidden />
                    Редактировать
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmArchive(true)}
                    disabled={busy}
                    className="w-full md:w-auto"
                  >
                    <Archive className="size-4" strokeWidth={1.5} aria-hidden />
                    Архивировать
                  </Button>
                </div>
                {org.status === 'active' ? (
                  <Button
                    variant="secondary"
                    onClick={handleSuspend}
                    loading={suspend.isPending}
                    disabled={busy && !suspend.isPending}
                    className="w-full md:w-auto"
                  >
                    <Power className="size-4" strokeWidth={1.5} aria-hidden />
                    Приостановить
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleActivate}
                    loading={activate.isPending}
                    disabled={busy && !activate.isPending}
                    className="w-full md:w-auto"
                  >
                    <Power className="size-4" strokeWidth={1.5} aria-hidden />
                    Активировать
                  </Button>
                )}
              </DrawerFooter>
            )
          ) : null}
        </DrawerContent>
      </DrawerRoot>
      <EditOrganizationDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        organization={org ?? null}
      />
    </>
  )
}

function OrganizationDrawerBody({ org }: { org: Organization }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
          <Building2 className="size-7" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <Badge variant={STATUS_VARIANT[org.status]}>{STATUS_LABEL[org.status]}</Badge>
        </div>
      </div>
      <dl className="flex flex-col">
        <DetailRow label="БИН" mono>
          {org.bin}
        </DetailRow>
        {org.contactName ? <DetailRow label="Контакт">{org.contactName}</DetailRow> : null}
        {org.contactPhone ? (
          <DetailRow label="Телефон" mono>
            {formatKzPhoneDisplay(org.contactPhone)}
          </DetailRow>
        ) : null}
        {org.contactEmail ? <DetailRow label="Email">{org.contactEmail}</DetailRow> : null}
        <DetailRow label="Создана">{formatRelativeTime(org.createdAt)}</DetailRow>
      </dl>
    </div>
  )
}

function OrganizationDrawerSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-[22px] w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {['r1', 'r2', 'r3', 'r4', 'r5'].map((k) => (
          <Skeleton key={k} className="h-8 w-full" />
        ))}
      </div>
    </div>
  )
}

function OrganizationDrawerError() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
      <div className="text-sm text-text-secondary">Не удалось загрузить организацию</div>
    </div>
  )
}
