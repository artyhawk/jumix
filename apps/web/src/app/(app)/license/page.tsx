'use client'

import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { LicenseUploadDialog } from '@/components/operator/license-upload-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LicenseStatusBadge } from '@/components/ui/license-status-badge'
import { useAuth } from '@/hooks/use-auth'
import { daysUntil, formatRuDate } from '@/lib/format/date'
import { useMeStatus } from '@/lib/hooks/use-me'
import { AlertTriangle, ExternalLink, FileText, IdCard, ShieldAlert } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Dedicated license-страница (B3-UI-4). State + upload dialog + warnings.
 * URL-state `?upload=true` opens dialog (cross-page команда «Загрузить
 * удостоверение» из command palette роутит сюда).
 *
 * Version history — backlog.
 */
export default function LicensePage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const status = useMeStatus()

  useEffect(() => {
    if (user && user.role !== 'operator') router.replace('/')
  }, [user, router])

  const uploadOpen = params.get('upload') === 'true'
  const setUpload = (open: boolean) => {
    const next = new URLSearchParams(params.toString())
    if (open) next.set('upload', 'true')
    else next.delete('upload')
    const qs = next.toString()
    router.replace(qs ? `/license?${qs}` : '/license', { scroll: false })
  }

  if (!user || user.role !== 'operator') return null

  if (status.isError) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
          <div className="text-sm text-text-secondary">Не удалось загрузить данные</div>
          <Button variant="ghost" onClick={() => status.refetch()}>
            Повторить
          </Button>
        </div>
      </PageTransition>
    )
  }

  const data = status.data
  const profile = data?.profile
  const licenseStatus = data?.licenseStatus ?? 'missing'
  const expiresAt = profile?.licenseExpiresAt ?? null
  const hasLicense = expiresAt !== null && licenseStatus !== 'missing'
  const days = expiresAt ? daysUntil(expiresAt) : null

  return (
    <PageTransition>
      <PageHeader
        title="Удостоверение крановщика"
        subtitle="Документ действителен при наличии срока действия и работающего трудоустройства"
      />

      {status.isLoading ? (
        <div className="h-[200px] rounded-[12px] border border-border-subtle bg-layer-2 animate-[pulse_1.5s_ease-in-out_infinite]" />
      ) : hasLicense && profile && expiresAt ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg bg-layer-3 text-text-secondary">
              <IdCard className="size-6" strokeWidth={1.5} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <LicenseStatusBadge status={licenseStatus} />
                {profile.licenseVersion !== undefined && profile.licenseVersion > 0 ? (
                  <Badge variant="neutral">
                    <span className="font-mono-numbers">v{profile.licenseVersion}</span>
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 text-sm text-text-secondary">
                Действует до{' '}
                <span className="text-text-primary font-medium">{formatRuDate(expiresAt)}</span>
              </div>
              {days !== null ? (
                <div className="mt-1 text-xs text-text-tertiary">
                  {days > 0
                    ? `Через ${days} ${pluralDays(days)}`
                    : days === 0
                      ? 'Истекает сегодня'
                      : `Просрочено ${Math.abs(days)} ${pluralDays(Math.abs(days))}`}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
            <Button variant="primary" onClick={() => setUpload(true)} className="w-full md:w-auto">
              Обновить удостоверение
            </Button>
            {profile.licenseUrl ? (
              <Button variant="ghost" asChild className="w-full md:w-auto">
                <a href={profile.licenseUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="size-4" strokeWidth={1.5} aria-hidden />
                  Посмотреть текущий файл
                  <ExternalLink className="size-4" strokeWidth={1.5} aria-hidden />
                </a>
              </Button>
            ) : null}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={IdCard}
          title="Удостоверение не загружено"
          description="Загрузите действующее удостоверение крановщика, чтобы работа была разблокирована."
          action={
            <Button variant="primary" onClick={() => setUpload(true)}>
              Загрузить удостоверение
            </Button>
          }
        />
      )}

      {licenseStatus === 'expired' ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-danger/25 bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden />
          <div>
            <div className="font-medium">Срок действия истёк</div>
            <div className="mt-1 text-text-secondary text-xs">
              Работа заблокирована до обновления документа.
            </div>
          </div>
        </div>
      ) : licenseStatus === 'expiring_critical' || licenseStatus === 'expiring_soon' ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden />
          <div>
            <div className="font-medium">
              {licenseStatus === 'expiring_critical'
                ? 'Срок действия истекает в ближайшие дни'
                : 'Срок действия скоро истекает'}
            </div>
            <div className="mt-1 text-text-secondary text-xs">
              Обновите документ заранее, чтобы не потерять возможность выхода на смену.
            </div>
          </div>
        </div>
      ) : null}

      <div className="text-xs text-text-tertiary">
        Удостоверение должно быть выдано аккредитованной организацией. Принимаются форматы: JPG,
        PNG, PDF до 10 МБ.
      </div>

      <LicenseUploadDialog open={uploadOpen} onOpenChange={setUpload} />
    </PageTransition>
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
