'use client'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { LicenseStatusBadge } from '@/components/ui/license-status-badge'
import { SearchInput } from '@/components/ui/search-input'
import { Skeleton } from '@/components/ui/skeleton'
import { isAppError } from '@/lib/api/errors'
import type { CraneProfile, LicenseStatus } from '@/lib/api/types'
import { useCraneProfiles } from '@/lib/hooks/use-crane-profiles'
import { useCreateHireRequest } from '@/lib/hooks/use-organization-operators'
import { cn } from '@/lib/utils'
import { AlertTriangle, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Двухшаговый диалог создания заявки на найм (B3-UI-3c).
 *   Step 1 — поиск approved crane_profile'ов (ФИО/ИИН, debounce 300ms, min 2 char).
 *   Step 2 — summary + license warning + hiredAt + submit.
 *
 * License warning (missing / expired) — informational, submit не блокируется
 * (см. ARCHITECTURE.md §B3-UI-3c — реальный work-gate на canWork, CLAUDE.md rule #15).
 */
export function CreateHireRequestDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selected, setSelected] = useState<CraneProfile | null>(null)
  const [hiredAt, setHiredAt] = useState<string>(() => todayISODate())
  const create = useCreateHireRequest()

  const handleClose = (next: boolean) => {
    if (!next) {
      setStep(1)
      setSelected(null)
      setHiredAt(todayISODate())
    }
    onOpenChange(next)
  }

  const handleSubmit = async () => {
    if (!selected) return
    try {
      await create.mutateAsync({
        craneProfileId: selected.id,
        hiredAt: hiredAt || undefined,
      })
      toast.success('Заявка отправлена на одобрение', {
        description: 'Платформа рассмотрит в течение 1–2 дней',
      })
      handleClose(false)
    } catch (err) {
      if (isAppError(err) && err.code === 'OPERATOR_ALREADY_HIRED') {
        toast.error('Этот крановой уже работает в вашей компании')
        return
      }
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось отправить заявку', { description: message })
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Нанять кранового</DialogTitle>
        <DialogDescription>
          Найдите кранового по ФИО или ИИН. Заявка отправится на одобрение платформе.
        </DialogDescription>

        <StepIndicator current={step} />

        {step === 1 ? (
          <Step1Search
            onSelect={(profile) => {
              setSelected(profile)
              setStep(2)
            }}
            selectedId={selected?.id ?? null}
            onCancel={() => handleClose(false)}
          />
        ) : selected ? (
          <Step2Confirm
            profile={selected}
            hiredAt={hiredAt}
            onHiredAtChange={setHiredAt}
            onBack={() => setStep(1)}
            onSubmit={handleSubmit}
            isPending={create.isPending}
          />
        ) : null}
      </DialogContent>
    </DialogRoot>
  )
}

function Step1Search({
  onSelect,
  selectedId,
  onCancel,
}: {
  onSelect: (profile: CraneProfile) => void
  selectedId: string | null
  onCancel: () => void
}) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  const query = useCraneProfiles({
    approvalStatus: 'approved',
    search: debounced.length >= 2 ? debounced : undefined,
    limit: 20,
  })

  const items = query.data?.items ?? []
  const showResults = debounced.length >= 2
  const isLoading = showResults && query.isLoading

  return (
    <div className="mt-4 flex flex-col gap-4">
      <SearchInput
        value={search}
        onDebouncedChange={(v) => {
          setSearch(v)
          setDebounced(v)
        }}
        placeholder="ФИО или ИИН…"
        ariaLabel="Поиск кранового"
      />

      <div className="min-h-[240px]">
        {!showResults ? (
          <EmptyHint
            icon={<Search className="size-8 text-text-tertiary" strokeWidth={1.5} aria-hidden />}
            title="Введите минимум 2 символа"
            subtitle="Поиск по ФИО или по началу ИИН"
          />
        ) : isLoading ? (
          <div className="flex flex-col gap-2">
            {['s1', 's2', 's3'].map((k) => (
              <Skeleton key={k} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyHint
            icon={<Search className="size-8 text-text-tertiary" strokeWidth={1.5} aria-hidden />}
            title="Крановые не найдены"
            subtitle="Проверьте написание или попросите оператора зарегистрироваться"
          />
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Результаты поиска">
            {items.map((profile) => (
              <li key={profile.id}>
                <ProfileSearchResult
                  profile={profile}
                  selected={selectedId === profile.id}
                  onSelect={() => onSelect(profile)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  )
}

function Step2Confirm({
  profile,
  hiredAt,
  onHiredAtChange,
  onBack,
  onSubmit,
  isPending,
}: {
  profile: CraneProfile
  hiredAt: string
  onHiredAtChange: (v: string) => void
  onBack: () => void
  onSubmit: () => void
  isPending: boolean
}) {
  const fullName = [profile.lastName, profile.firstName, profile.patronymic]
    .filter(Boolean)
    .join(' ')
  const warnLicense = isLicenseProblematic(profile.licenseStatus)

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-[10px] border border-border-default bg-layer-1 p-3">
        <Avatar size="lg" src={profile.avatarUrl} name={fullName} userId={profile.id} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-text-primary">{fullName}</div>
          <div className="font-mono-numbers text-xs text-text-tertiary">{profile.iin}</div>
        </div>
        <LicenseStatusBadge status={profile.licenseStatus} />
      </div>

      {warnLicense ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden />
          <div className="flex flex-col gap-1">
            <span className="font-medium">
              {profile.licenseStatus === 'missing'
                ? 'Удостоверение не загружено'
                : 'Удостоверение просрочено'}
            </span>
            <span className="text-xs text-text-secondary">
              Заявку можно подать, но крановой не сможет выйти на смену, пока удостоверение не будет
              обновлено.
            </span>
          </div>
        </div>
      ) : null}

      <Field label="Дата приёма на работу" required>
        <Input
          type="date"
          value={hiredAt}
          onChange={(e) => onHiredAtChange(e.target.value)}
          max={maxFutureDate(1)}
          aria-label="Дата приёма"
        />
      </Field>

      <div className="mt-2 flex flex-col-reverse gap-2 md:flex-row md:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isPending}>
          Назад
        </Button>
        <Button type="button" variant="primary" onClick={onSubmit} loading={isPending}>
          Создать заявку
        </Button>
      </div>
    </div>
  )
}

export function ProfileSearchResult({
  profile,
  selected,
  onSelect,
}: {
  profile: CraneProfile
  selected: boolean
  onSelect: () => void
}) {
  const fullName = [profile.lastName, profile.firstName, profile.patronymic]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-[10px] border bg-layer-1 p-3 text-left',
        'min-h-[44px] transition-colors duration-150',
        selected
          ? 'border-brand-500 bg-brand-500/5'
          : 'border-border-subtle hover:border-border-default',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
      )}
    >
      <Avatar size="md" src={profile.avatarUrl} name={fullName} userId={profile.id} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">{fullName}</div>
        <div className="font-mono-numbers text-xs text-text-tertiary">{profile.iin}</div>
      </div>
      <LicenseStatusBadge status={profile.licenseStatus} />
    </button>
  )
}

function EmptyHint({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      {icon}
      <div className="text-sm text-text-secondary">{title}</div>
      {subtitle ? <div className="text-xs text-text-tertiary">{subtitle}</div> : null}
    </div>
  )
}

function StepIndicator({ current }: { current: 1 | 2 }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <Step index={1} label="Поиск" active={current === 1} done={current > 1} />
      <div className="h-px flex-1 bg-border-subtle" />
      <Step index={2} label="Подтверждение" active={current === 2} done={false} />
    </div>
  )
}

function Step({
  index,
  label,
  active,
  done,
}: {
  index: number
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-full text-xs font-medium border',
          done && 'border-brand-500 bg-brand-500 text-white',
          active && !done && 'border-brand-500 text-brand-500',
          !active && !done && 'border-border-default text-text-tertiary',
        )}
      >
        {index}
      </span>
      <span
        className={cn('text-xs font-medium', active ? 'text-text-primary' : 'text-text-tertiary')}
      >
        {label}
      </span>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input via children
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-secondary">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      {children}
    </label>
  )
}

function todayISODate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function maxFutureDate(yearsAhead: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + yearsAhead)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isLicenseProblematic(status: LicenseStatus): boolean {
  return status === 'missing' || status === 'expired'
}
