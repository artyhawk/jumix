import type { LicenseStatus } from '@/lib/api/types'
import { daysUntil, formatRuDate } from '@/lib/format/date'
import { Badge, type BadgeVariant } from './badge'

interface LicenseStatusBadgeProps {
  status: LicenseStatus
  className?: string
  /**
   * Enriched-variant (B3-UI-5a): inline expiry info рядом со статусом —
   * «Действует · до 12 апр 2027» / «Истекает · через 14 дней» /
   * «Просрочено · 3 дня назад». Требует `expiresAt` (ISO). Если null —
   * падает обратно на compact label. Использовать в drawers / detail
   * cards где есть место; compact-variant остаётся для list-rows.
   */
  enriched?: boolean
  expiresAt?: string | null
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
export function LicenseStatusBadge({
  status,
  className,
  enriched,
  expiresAt,
}: LicenseStatusBadgeProps) {
  const label = enriched && expiresAt ? buildEnrichedLabel(status, expiresAt) : LABELS[status]
  return (
    <Badge variant={VARIANTS[status]} className={className}>
      {label}
    </Badge>
  )
}

function buildEnrichedLabel(status: LicenseStatus, expiresAt: string): string {
  if (status === 'missing') return LABELS.missing
  const days = daysUntil(expiresAt)
  if (status === 'expired') {
    const abs = Math.abs(days)
    return `Просрочено · ${abs} ${pluralDays(abs)} назад`
  }
  if (status === 'expiring_soon' || status === 'expiring_critical') {
    if (days === 0) return 'Истекает сегодня'
    return `Истекает · через ${days} ${pluralDays(days)}`
  }
  // valid
  return `Действует · до ${formatRuDate(expiresAt)}`
}

function pluralDays(n: number): string {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней'
  if (last === 1) return 'день'
  if (last >= 2 && last <= 4) return 'дня'
  return 'дней'
}
