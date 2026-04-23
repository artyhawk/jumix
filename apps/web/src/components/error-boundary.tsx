'use client'

import { Button } from '@/components/ui/button'
import { AlertOctagon } from 'lucide-react'
import { useEffect } from 'react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  description?: string
}

/**
 * Shared ErrorBoundary component для Next.js `error.tsx` files (B3-UI-5a).
 * Каждая route (page) имеет свой sibling error.tsx, который импортирует
 * этот component. В useEffect — forward к Sentry (B3-UI-5b добавит init).
 *
 * Design-system: semantic `danger` icon + text — НЕ brand-orange
 * (consistency с MeStatusCard rule из §8.5).
 */
export function ErrorBoundary({
  error,
  reset,
  title = 'Что-то пошло не так',
  description = 'Попробуйте обновить страницу или вернитесь позже.',
}: Props) {
  useEffect(() => {
    // TODO(sentry): forward к Sentry.captureException(error) после B3-UI-5b
    // eslint-disable-next-line no-console
    console.error('[page-error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 px-4 text-center">
      <div className="relative">
        <div aria-hidden className="absolute inset-0 rounded-full bg-danger/15 blur-2xl" />
        <div className="relative inline-flex size-16 items-center justify-center rounded-full border border-danger/40 bg-layer-3">
          <AlertOctagon className="size-7 text-danger" strokeWidth={1.5} aria-hidden />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        <p className="max-w-sm text-sm text-text-secondary">{description}</p>
      </div>
      {error.digest ? (
        <p className="font-mono-numbers text-xs text-text-tertiary">ID: {error.digest}</p>
      ) : null}
      <Button variant="primary" onClick={reset}>
        Попробовать снова
      </Button>
    </div>
  )
}
