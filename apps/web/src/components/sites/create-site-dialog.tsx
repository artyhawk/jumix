'use client'

import { MapPicker, type MapPickerValue } from '@/components/map/map-picker'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { isAppError } from '@/lib/api/errors'
import { useCreateSite } from '@/lib/hooks/use-sites'
import { cn } from '@/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const detailsSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(200, 'Максимум 200 символов'),
  address: z.string().trim().max(500, 'Максимум 500 символов').optional().or(z.literal('')),
})
type DetailsFormValues = z.infer<typeof detailsSchema>

/**
 * Двухшаговый диалог создания site:
 *   Step 1 — имя + адрес (опционально).
 *   Step 2 — map picker + slider радиуса.
 *
 * URL-state-driven через родительскую страницу (`?create=true`). На
 * закрытии/успехе форма сбрасывается.
 */
export function CreateSiteDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [location, setLocation] = useState<MapPickerValue | null>(null)
  const create = useCreateSite()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    getValues,
  } = useForm<DetailsFormValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: '', address: '' },
  })

  const handleClose = (next: boolean) => {
    if (!next) {
      reset()
      setStep(1)
      setLocation(null)
    }
    onOpenChange(next)
  }

  const handleStep1 = handleSubmit(() => {
    setStep(2)
  })

  const handleCreate = async () => {
    if (!location) return
    const values = getValues()
    try {
      await create.mutateAsync({
        name: values.name.trim(),
        address: values.address?.trim() || undefined,
        latitude: location.latitude,
        longitude: location.longitude,
        radiusM: location.radiusM,
      })
      toast.success('Объект создан')
      handleClose(false)
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось создать', { description: message })
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Новый объект</DialogTitle>
        <DialogDescription>
          Укажите название и расположение. Объект появится в списке сразу после создания.
        </DialogDescription>

        <StepIndicator current={step} />

        {step === 1 ? (
          <form onSubmit={handleStep1} className="mt-4 flex flex-col gap-4">
            <Field label="Название" error={errors.name?.message} required>
              <Input
                invalid={Boolean(errors.name)}
                placeholder="Новый ЖК «Актобе Парк»"
                {...register('name')}
                autoFocus
              />
            </Field>
            <Field label="Адрес" error={errors.address?.message}>
              <Input
                invalid={Boolean(errors.address)}
                placeholder="ул. Абая, 15"
                {...register('address')}
              />
            </Field>
            <div className="mt-2 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
                Отмена
              </Button>
              <Button type="submit" variant="primary">
                Далее
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <MapPicker value={location} onChange={setLocation} defaultRadius={200} />
            <div className="mt-2 flex flex-col-reverse gap-2 md:flex-row md:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(1)}
                disabled={create.isPending}
              >
                Назад
              </Button>
              <div className="flex flex-col-reverse gap-2 md:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleClose(false)}
                  disabled={create.isPending}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleCreate}
                  loading={create.isPending}
                  disabled={!location}
                >
                  Создать
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </DialogRoot>
  )
}

function StepIndicator({ current }: { current: 1 | 2 }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <Step index={1} label="Данные" active={current === 1} done={current > 1} />
      <div className="h-px flex-1 bg-border-subtle" />
      <Step index={2} label="Расположение" active={current === 2} done={false} />
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
  error,
  required,
  children,
}: {
  label: string
  error?: string
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
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  )
}
