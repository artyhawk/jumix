'use client'

import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '@/components/ui/dialog'
import { FilePicker } from '@/components/ui/file-picker'
import { Input } from '@/components/ui/input'
import { useUploadLicense } from '@/lib/hooks/use-me'
import { useState } from 'react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MAX_SIZE_MB = 10
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024
const ACCEPTED_TYPES: ReadonlyArray<string> = ['image/jpeg', 'image/png', 'application/pdf']

/**
 * Single-step dialog для загрузки удостоверения (B3-UI-4). UI один submit,
 * backend внутренне three-phase (см. useUploadLicense).
 *
 * Client-side validation:
 *   - content-type whitelist (jpg/png/pdf) — соответствует backend enum
 *   - size ≤ 10MB — matches ADR 0005 limit
 *   - expiresAt — tomorrow-or-later (не сегодня, не прошлое); max +20 лет
 *     (backend refine — щедрая граница)
 *
 * При ошибке loading-state не схлопывается — dialog остаётся open для retry
 * (toast через mutation onError).
 */
export function LicenseUploadDialog({ open, onOpenChange }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [expiresAt, setExpiresAt] = useState<string>('')
  const [fileError, setFileError] = useState<string | null>(null)
  const upload = useUploadLicense()

  const handleClose = (next: boolean) => {
    if (!next) {
      setFile(null)
      setExpiresAt('')
      setFileError(null)
    }
    onOpenChange(next)
  }

  const handleFile = (f: File | null) => {
    if (!f) {
      setFile(null)
      setFileError(null)
      return
    }
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setFile(null)
      setFileError('Допустимые форматы: JPG, PNG, PDF')
      return
    }
    if (f.size > MAX_SIZE_BYTES) {
      setFile(null)
      setFileError(`Файл больше ${MAX_SIZE_MB} МБ`)
      return
    }
    setFile(f)
    setFileError(null)
  }

  const canSubmit = file !== null && expiresAt !== '' && !upload.isPending

  const handleSubmit = async () => {
    if (!file || !expiresAt) return
    try {
      await upload.mutateAsync({ file, expiresAt })
      handleClose(false)
    } catch {
      // toast surfaced в onError mutation — keep dialog open для retry
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Загрузка удостоверения</DialogTitle>
        <DialogDescription>Принимаются JPG, PNG, PDF до {MAX_SIZE_MB} МБ</DialogDescription>

        <div className="mt-4 flex flex-col gap-4">
          <FilePicker
            value={file}
            onChange={handleFile}
            accept={ACCEPTED_TYPES.join(',')}
            error={fileError}
            helperText="JPG, PNG, PDF — до 10 МБ"
            ariaLabel="Файл удостоверения"
          />

          <Field label="Срок действия" required>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={tomorrowISODate()}
              max={maxExpiryDate()}
              aria-label="Срок действия удостоверения"
            />
          </Field>

          <p className="text-xs text-text-tertiary leading-relaxed">
            Я подтверждаю, что загружаю оригинальное действующее удостоверение крановщика. Платформа
            может запросить дополнительные документы.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleClose(false)}
            disabled={upload.isPending}
          >
            Отмена
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            loading={upload.isPending}
            disabled={!canSubmit}
          >
            Загрузить
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
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

function tomorrowISODate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return isoDate(d)
}

function maxExpiryDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 20)
  return isoDate(d)
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
