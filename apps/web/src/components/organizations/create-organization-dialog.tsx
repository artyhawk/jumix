'use client'

import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { isAppError } from '@/lib/api/errors'
import { useCreateOrganization } from '@/lib/hooks/use-organizations'
import { applyPhoneMask, toE164 } from '@/lib/phone-format'
import { zodResolver } from '@hookform/resolvers/zod'
import { isValidKzBin, isValidKzPhone } from '@jumix/shared'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const phoneField = z
  .string()
  .trim()
  .refine((v) => isValidKzPhone(v), { message: 'Введите телефон формата +7 7XX XXX XX XX' })

const formSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(200, 'Максимум 200 символов'),
  bin: z
    .string()
    .trim()
    .refine((v) => isValidKzBin(v), {
      message: 'Неверный БИН (12 цифр, проверьте контрольный разряд)',
    }),
  contactName: z.string().trim().max(200, 'Максимум 200 символов').optional().or(z.literal('')),
  contactPhone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isValidKzPhone(v), { message: 'Неверный формат' })
    .or(z.literal('')),
  contactEmail: z
    .string()
    .trim()
    .max(254, 'Максимум 254 символа')
    .email('Неверный email')
    .optional()
    .or(z.literal('')),
  ownerName: z.string().trim().min(1, 'Укажите имя владельца').max(200),
  ownerPhone: phoneField,
})

type FormValues = z.infer<typeof formSchema>

export function CreateOrganizationDialog({ open, onOpenChange }: Props) {
  const create = useCreateOrganization()
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      bin: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      ownerName: '',
      ownerPhone: '',
    },
  })

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const onSubmit = handleSubmit(async (values) => {
    const ownerE164 = normalizeOrSelf(values.ownerPhone)
    const contactE164 = values.contactPhone ? normalizeOrSelf(values.contactPhone) : undefined
    try {
      await create.mutateAsync({
        name: values.name.trim(),
        bin: values.bin.trim(),
        contactName: values.contactName?.trim() || undefined,
        contactPhone: contactE164,
        contactEmail: values.contactEmail?.trim() || undefined,
        ownerName: values.ownerName.trim(),
        ownerPhone: ownerE164,
      })
      toast.success('Организация создана')
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
        <DialogTitle>Новая организация</DialogTitle>
        <DialogDescription>
          Первый владелец получит SMS-инвайт, пароль задаст позже через password-reset.
        </DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
          <Field label="Название" error={errors.name?.message} required>
            <Input invalid={Boolean(errors.name)} {...register('name')} autoFocus />
          </Field>
          <Field label="БИН" error={errors.bin?.message} required>
            <Input
              invalid={Boolean(errors.bin)}
              inputMode="numeric"
              maxLength={12}
              className="font-mono-numbers"
              {...register('bin')}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Контактное лицо" error={errors.contactName?.message}>
              <Input invalid={Boolean(errors.contactName)} {...register('contactName')} />
            </Field>
            <Field label="Контактный телефон" error={errors.contactPhone?.message}>
              <Controller
                control={control}
                name="contactPhone"
                render={({ field }) => (
                  <Input
                    invalid={Boolean(errors.contactPhone)}
                    inputMode="tel"
                    placeholder="+7 7XX XXX XX XX"
                    value={field.value}
                    onChange={(e) => {
                      const { formatted } = applyPhoneMask(e.target.value)
                      field.onChange(formatted)
                    }}
                  />
                )}
              />
            </Field>
          </div>
          <Field label="Контактный email" error={errors.contactEmail?.message}>
            <Input
              invalid={Boolean(errors.contactEmail)}
              inputMode="email"
              {...register('contactEmail')}
            />
          </Field>
          <div className="mt-2 border-t border-border-subtle pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
              Владелец
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Имя владельца" error={errors.ownerName?.message} required>
              <Input invalid={Boolean(errors.ownerName)} {...register('ownerName')} />
            </Field>
            <Field label="Телефон владельца" error={errors.ownerPhone?.message} required>
              <Controller
                control={control}
                name="ownerPhone"
                render={({ field }) => (
                  <Input
                    invalid={Boolean(errors.ownerPhone)}
                    inputMode="tel"
                    placeholder="+7 7XX XXX XX XX"
                    value={field.value}
                    onChange={(e) => {
                      const { formatted } = applyPhoneMask(e.target.value)
                      field.onChange(formatted)
                    }}
                  />
                )}
              />
            </Field>
          </div>
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
              Создать
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

function normalizeOrSelf(input: string): string {
  const { digits } = applyPhoneMask(input)
  return toE164(digits) ?? input.trim()
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
