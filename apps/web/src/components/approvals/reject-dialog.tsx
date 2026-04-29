'use client'

import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { isAppError } from '@/lib/api/errors'
import { useRejectCraneProfile } from '@/lib/hooks/use-crane-profiles'
import { useRejectCrane } from '@/lib/hooks/use-cranes'
import { useRejectOrganizationOperator } from '@/lib/hooks/use-organization-operators'
import { useState } from 'react'
import { toast } from 'sonner'

export type RejectEntity = 'crane-profile' | 'hire' | 'crane'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity: RejectEntity
  entityId: string | null
  entityLabel: string
}

const ENTITY_NOUN: Record<RejectEntity, string> = {
  'crane-profile': 'кранового',
  hire: 'найма',
  crane: 'крана',
}

const MAX_REASON = 500

export function RejectDialog({ open, onOpenChange, entity, entityId, entityLabel }: Props) {
  const [reason, setReason] = useState('')

  const rejectCp = useRejectCraneProfile()
  const rejectHire = useRejectOrganizationOperator()
  const rejectCrane = useRejectCrane()

  const mutation =
    entity === 'crane-profile' ? rejectCp : entity === 'hire' ? rejectHire : rejectCrane

  const trimmed = reason.trim()
  const canSubmit = trimmed.length > 0 && !mutation.isPending && Boolean(entityId)

  const handleClose = (next: boolean) => {
    if (!next) setReason('')
    onOpenChange(next)
  }

  const handleSubmit = async () => {
    if (!entityId || !canSubmit) return
    try {
      await mutation.mutateAsync({ id: entityId, reason: trimmed })
      toast.success('Заявка отклонена')
      setReason('')
      onOpenChange(false)
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось отклонить', { description: message })
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogTitle>Отклонить заявку {ENTITY_NOUN[entity]}?</DialogTitle>
        <DialogDescription>{entityLabel}</DialogDescription>
        <div className="mt-4 space-y-2">
          <label htmlFor="reject-reason" className="block text-sm font-medium text-text-secondary">
            Причина отклонения
          </label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
            placeholder="Например: не указаны необходимые сертификаты"
            maxLength={MAX_REASON}
            rows={4}
          />
          <div className="flex items-start justify-between gap-3 text-xs text-text-tertiary">
            <span>Заявитель получит причину. Отклонённая запись становится read-only.</span>
            <span className="font-mono-numbers shrink-0">
              {reason.length}/{MAX_REASON}
            </span>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse md:flex-row md:justify-end gap-2">
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={mutation.isPending}>
            Отмена
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={mutation.isPending}
          >
            Отклонить
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
