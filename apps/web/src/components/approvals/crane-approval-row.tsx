'use client'

import { Button } from '@/components/ui/button'
import type { Crane } from '@/lib/api/types'
import { formatRelativeTime } from '@/lib/format/time'
import { IconCrane } from '@tabler/icons-react'
import { Building2 } from 'lucide-react'

interface Props {
  crane: Crane
  organizationName?: string
  onApprove: () => void
  onReject: () => void
  isPending?: boolean
}

const TYPE_LABELS: Record<Crane['type'], string> = {
  tower: 'Башенный',
  mobile: 'Мобильный',
  crawler: 'Гусеничный',
  overhead: 'Мостовой',
}

export function CraneApprovalRow({
  crane,
  organizationName,
  onApprove,
  onReject,
  isPending,
}: Props) {
  return (
    <div className="group flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-layer-2 border border-border-subtle hover:border-border-default rounded-[10px] p-4 transition-colors">
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <span className="inline-flex items-center justify-center size-10 rounded-md border border-border-subtle bg-layer-3 shrink-0">
          <IconCrane className="size-5 text-text-secondary" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">
            {crane.model}
            {crane.inventoryNumber ? (
              <>
                <span className="text-text-tertiary"> · </span>
                <span className="font-mono-numbers text-text-secondary">
                  {crane.inventoryNumber}
                </span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary flex-wrap">
            <span>{TYPE_LABELS[crane.type]}</span>
            <span>·</span>
            <span>{crane.capacityTon} т</span>
            {organizationName ? (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-text-secondary">
                  <Building2 className="size-3.5" strokeWidth={1.5} aria-hidden />
                  {organizationName}
                </span>
              </>
            ) : null}
            <span>·</span>
            <span>{formatRelativeTime(crane.createdAt)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="primary"
          size="sm"
          onClick={onApprove}
          disabled={isPending}
          className="flex-1 md:flex-none"
        >
          Одобрить
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReject}
          disabled={isPending}
          className="flex-1 md:flex-none"
        >
          Отклонить
        </Button>
      </div>
    </div>
  )
}
