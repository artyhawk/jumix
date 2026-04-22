'use client'

import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { isAppError } from '@/lib/api/errors'
import type { CraneType } from '@/lib/api/types'
import { useCreateCrane } from '@/lib/hooks/use-cranes'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TYPE_OPTIONS: ReadonlyArray<{ value: CraneType; label: string }> = [
  { value: 'tower', label: 'Башенный' },
  { value: 'mobile', label: 'Мобильный' },
  { value: 'crawler', label: 'Гусеничный' },
  { value: 'overhead', label: 'Мостовой' },
] as const

const CURRENT_YEAR = new Date().getUTCFullYear()

const numericString = (raw: string) => {
  const trimmed = raw.trim().replace(',', '.')
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

const formSchema = z.object({
  type: z.enum(['tower', 'mobile', 'crawler', 'overhead']),
  model: z.string().trim().min(1, 'Укажите модель').max(200, 'Максимум 200 символов'),
  inventoryNumber: z.string().trim().max(100, 'Максимум 100 символов').optional().or(z.literal('')),
  capacityTon: z
    .string()
    .trim()
    .min(1, 'Укажите грузоподъёмность')
    .refine((v) => {
      const n = Number(v.replace(',', '.'))
      return Number.isFinite(n) && n > 0 && n <= 999_999.99
    }, 'Введите положительное число (до 999 999.99)'),
  boomLengthM: z
    .string()
    .trim()
    .optional()
    .refine((v) => {
      if (!v) return true
      const n = Number(v.replace(',', '.'))
      return Number.isFinite(n) && n > 0 && n <= 9_999.99
    }, 'Введите положительное число (до 9 999.99)')
    .or(z.literal('')),
  yearManufactured: z
    .string()
    .trim()
    .optional()
    .refine((v) => {
      if (!v) return true
      const n = Number(v)
      return Number.isInteger(n) && n >= 1900 && n <= CURRENT_YEAR
    }, `Год от 1900 до ${CURRENT_YEAR}`)
    .or(z.literal('')),
  notes: z.string().trim().max(2000, 'Максимум 2000 символов').optional().or(z.literal('')),
})

type FormValues = z.infer<typeof formSchema>

export function CreateCraneDialog({ open, onOpenChange }: Props) {
  const create = useCreateCrane()
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: 'tower',
      model: '',
      inventoryNumber: '',
      capacityTon: '',
      boomLengthM: '',
      yearManufactured: '',
      notes: '',
    },
  })

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const onSubmit = handleSubmit(async (values) => {
    const capacity = numericString(values.capacityTon)
    if (capacity === undefined || Number.isNaN(capacity)) return
    const boom = values.boomLengthM ? numericString(values.boomLengthM) : undefined
    const year = values.yearManufactured ? Number(values.yearManufactured) : undefined
    try {
      await create.mutateAsync({
        type: values.type,
        model: values.model.trim(),
        inventoryNumber: values.inventoryNumber?.trim() || undefined,
        capacityTon: capacity,
        boomLengthM: boom !== undefined && !Number.isNaN(boom) ? boom : undefined,
        yearManufactured: year !== undefined && !Number.isNaN(year) ? year : undefined,
        notes: values.notes?.trim() || undefined,
      })
      toast.success('Заявка отправлена на одобрение', {
        description: 'Платформа рассмотрит в течение 1–2 дней',
      })
      reset()
      onOpenChange(false)
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось создать', { description: message })
    }
  })

  return (
    <DialogRoot open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogTitle>Новый кран</DialogTitle>
        <DialogDescription>
          После создания заявка отправится администратору платформы. Эксплуатация — после одобрения.
        </DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
          <Field label="Тип" error={errors.type?.message} required>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <select
                  aria-label="Тип крана"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value as CraneType)}
                  className="w-full min-h-[44px] md:min-h-0 md:h-10 px-3 rounded-[10px] bg-layer-1 border border-border-default text-sm text-text-primary focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            />
          </Field>
          <Field label="Модель" error={errors.model?.message} required>
            <Input invalid={Boolean(errors.model)} {...register('model')} autoFocus />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Инвентарный №" error={errors.inventoryNumber?.message}>
              <Input
                invalid={Boolean(errors.inventoryNumber)}
                className="font-mono-numbers"
                {...register('inventoryNumber')}
              />
            </Field>
            <Field label="Грузоподъёмность, т" error={errors.capacityTon?.message} required>
              <Input
                invalid={Boolean(errors.capacityTon)}
                inputMode="decimal"
                className="font-mono-numbers"
                {...register('capacityTon')}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Длина стрелы, м" error={errors.boomLengthM?.message}>
              <Input
                invalid={Boolean(errors.boomLengthM)}
                inputMode="decimal"
                className="font-mono-numbers"
                {...register('boomLengthM')}
              />
            </Field>
            <Field label="Год выпуска" error={errors.yearManufactured?.message}>
              <Input
                invalid={Boolean(errors.yearManufactured)}
                inputMode="numeric"
                maxLength={4}
                className="font-mono-numbers"
                {...register('yearManufactured')}
              />
            </Field>
          </div>
          <Field label="Заметки" error={errors.notes?.message}>
            <Input invalid={Boolean(errors.notes)} {...register('notes')} />
          </Field>
          <div className="mt-4 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleClose(false)}
              disabled={create.isPending}
            >
              Отмена
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Отправить на одобрение
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
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
    // biome-ignore lint/a11y/noLabelWithoutControl: input rendered via children — checked via getByLabelText in tests
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
