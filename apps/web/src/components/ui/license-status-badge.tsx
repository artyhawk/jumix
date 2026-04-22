import type { LicenseStatus } from '@/lib/api/types'
import { Badge, type BadgeVariant } from './badge'

interface LicenseStatusBadgeProps {
  status: LicenseStatus
  className?: string
}

const LABELS: Record<LicenseStatus, string> = {
  missing: 'Нет',
  valid: 'Действует',
  expiring_soon: 'Истекает',
  expiring_critical: 'Истекает',
  expired: 'Просрочено',
}

const VARIANTS: Record<LicenseStatus, BadgeVariant> = {
  missing: 'rejected',
  valid: 'approved',
  expiring_soon: 'expiring',
  expiring_critical: 'expiring',
  expired: 'expired',
}

/**
 * Badge для `licenseStatus` crane profile'а. Computed на server boundary,
 * клиент просто рендерит. `expiring_critical` и `expiring_soon` визуально
 * одинаковые — различие учитывается в priority (rule #15).
 */
export function LicenseStatusBadge({ status, className }: LicenseStatusBadgeProps) {
  return (
    <Badge variant={VARIANTS[status]} className={className}>
      {LABELS[status]}
    </Badge>
  )
}
