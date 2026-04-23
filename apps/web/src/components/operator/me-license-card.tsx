'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LicenseStatusBadge } from '@/components/ui/license-status-badge'
import type { CraneProfile, LicenseStatus } from '@/lib/api/types'
import { daysUntil, formatRuDate } from '@/lib/format/date'
import { ArrowRight, IdCard } from 'lucide-react'
import Link from 'next/link'

interface Props {
  profile: CraneProfile
  licenseStatus: LicenseStatus
  onUploadClick: () => void
}

/**
 * License card на /me (B3-UI-4). Quick action: upload или replace. Полная
 * история версий — backlog. Expiry surfaced human-readable: "12 апреля 2027
 * · через 354 дня" / "просрочено 5 дней назад".
 */
export function MeLicenseCard({ profile, licenseStatus, onUploadClick }: Props) {
  const expiresAt = profile.licenseExpiresAt
  const hasLicense = expiresAt !== null && licenseStatus !== 'missing'
  const days = expiresAt ? daysUntil(expiresAt) : null

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-md bg-layer-3 text-text-secondary">
            <IdCard className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <div className="text-sm font-medium text-text-secondary">Удостоверение</div>
            <LicenseStatusBadge status={licenseStatus} className="mt-1" />
          </div>
        </div>
      </div>

      {hasLicense && expiresAt ? (
        <div className="flex flex-col gap-1">
          <div className="text-sm text-text-secondary">
            Действует до <span className="text-text-primary">{formatRuDate(expiresAt)}</span>
          </div>
          {days !== null ? (
            <div className="text-xs text-text-tertiary">
              {days > 0
                ? `Через ${days} ${pluralDays(days)}`
                : days === 0
                  ? 'Истекает сегодня'
                  : `Просрочено ${Math.abs(days)} ${pluralDays(Math.abs(days))}`}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-text-secondary">Удостоверение не загружено</div>
      )}

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Button
          variant={hasLicense ? 'secondary' : 'primary'}
          onClick={onUploadClick}
          className="w-full md:w-auto"
        >
          {hasLicense ? 'Обновить' : 'Загрузить удостоверение'}
        </Button>
        <Button variant="ghost" asChild className="w-full md:w-auto">
          <Link href="/license">
            Управление удостоверением
            <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
          </Link>
        </Button>
      </div>
    </Card>
  )
}

function pluralDays(n: number): string {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней'
  if (last === 1) return 'день'
  if (last >= 2 && last <= 4) return 'дня'
  return 'дней'
}
