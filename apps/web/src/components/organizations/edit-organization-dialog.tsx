'use client'

import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { isAppError } from '@/lib/api/errors'
import type { Organization } from '@/lib/api/types'
import { useUpdateOrganization } from '@/lib/hooks/use-organizations'
import { applyPhoneMask, toE164 } from '@/lib/phone-format'
import { zodResolver } from '@hookform/resolvers/zod'
import { isValidKzBin, isValidKzPhone } from '@jumix/shared'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  organization: Organization | null
}

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
})

type FormValues = z.infer<typeof formSchema>

/**
 * Edit dialog для существующей организации (B3-UI-5a). Superadmin-only
 * surface; только identity-поля (name/bin/contacts), status transitions —
 * отдельные endpoints через OrganizationDrawer footer actions.
 *
 * `null` в contactName/phone/email посылает на backend = "очистить поле"
 * (convention из backend schemas). Пустая строка в форме нормализуется в null.
 */
export function EditOrganizationDialog({ open, onOpenChange, organization }: Props) {
  const update = useUpdateOrganization()
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      bin: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
    },
  })

  // Reset при открытии с актуальными значениями (new organization selected).
  useEffect(() => {
    if (open && organization) {
      reset({
        name: organization.name,
        bin: organization.bin,
        contactName: organization.contactName ?? '',
        contactPhone: organization.contactPhone ?? '',
        contactEmail: organization.contactEmail ?? '',
      })
    }
  }, [open, organization, reset])

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!organization) return
    const contactE164 = values.contactPhone ? normalizeOrSelf(values.contactPhone) : null
    try {
      await update.mutateAsync({
        id: organization.id,
        patch: {
          name: values.name.trim(),
          bin: values.bin.trim(),
          contactName: values.contactName?.trim() || null,
          contactPhone: contactE164,
          contactEmail: values.contactEmail?.trim() || null,
        },
      })
      toast.success('Организация обновлена')
      onOpenChange(false)
    } catch (err) {
      const message = isAppError(err) ? err.message : 'Попробуйте ещё раз'
      toast.error('Не удалось сохранить', { description: message })
    }
  })

  return (
    <DialogRoot open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogTitle>Редактировать организацию</DialogTitle>
        <DialogDescription>
          Идентификационные данные и контакты. Для изменения статуса используйте действия в
          карточке.
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
          <div className="mt-4 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleClose(false)}
              disabled={update.isPending}
            >
              Отмена
            </Button>
            <Button type="submit" variant="primary" loading={update.isPending} disabled={!isDirty}>
              Сохранить
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
    // biome-ignore lint/a11y/noLabelWithoutControl: input rendered via children
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
