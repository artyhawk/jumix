'use client'

import { ErrorBoundary } from '@/components/error-boundary'

/**
 * Root-level error boundary. Catches errors раньше, чем layout смогло
 * инициализироваться (например, ошибка в auth-provider). Next.js
 * конвенция — `app/error.tsx` получает `{error, reset}` props.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-layer-0 p-4">
      <ErrorBoundary error={error} reset={reset} />
    </div>
  )
}
