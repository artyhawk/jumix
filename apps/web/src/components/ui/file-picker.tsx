'use client'

import { cn } from '@/lib/utils'
import { FileText, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'

export interface FilePickerProps {
  value: File | null
  onChange: (file: File | null) => void
  accept?: string
  error?: string | null
  helperText?: string
  className?: string
  ariaLabel?: string
}

/**
 * Reusable file picker primitive (B3-UI-4). Drag-drop zone с click fallback,
 * accessible через hidden `<input type="file">`. Показывает file metadata
 * (name, size) и inline-error если present. Touch: drag-drop не сработает
 * на mobile (как обычно), но tap → native file picker.
 *
 * Brand-500 появляется только в drag-over состоянии (consistent с filter-chip
 * active-state). Error border — semantic danger color.
 */
export function FilePicker({
  value,
  onChange,
  accept,
  error,
  helperText,
  className,
  ariaLabel = 'Выбор файла',
}: FilePickerProps) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) onChange(f)
  }

  const openPicker = () => inputRef.current?.click()

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className={cn(
          'relative w-full min-h-[120px] rounded-[10px] border-2 border-dashed',
          'transition-colors duration-150',
          dragOver
            ? 'border-brand-500 bg-brand-500/5'
            : error
              ? 'border-danger/60 bg-layer-1'
              : 'border-border-default bg-layer-1',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        <button
          type="button"
          onClick={openPicker}
          aria-label={ariaLabel}
          className={cn(
            'block w-full min-h-[120px] rounded-[10px] p-4 text-left',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
            value ? '' : 'hover:border-border-strong',
          )}
        >
          {value ? (
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-layer-3 text-text-secondary">
                <FileText className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text-primary">{value.name}</div>
                <div className="text-xs text-text-tertiary">
                  {formatBytes(value.size)} · {value.type || 'файл'}
                </div>
              </div>
              <span className="size-8 shrink-0" aria-hidden />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-3 text-center">
              <Upload className="size-8 text-text-tertiary" strokeWidth={1.5} aria-hidden />
              <div className="text-sm text-text-primary">
                Перетащите файл или нажмите для выбора
              </div>
              {helperText ? <div className="text-xs text-text-tertiary">{helperText}</div> : null}
            </div>
          )}
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Удалить файл"
            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded text-text-tertiary hover:bg-layer-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
        ) : null}
      </div>

      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}
