'use client'

import { ErrorBoundary } from '@/components/error-boundary'

/**
 * Catch-all для authenticated area (shell рендерится, а одна из страниц
 * кидает — sidebar + topbar остаются, контент замещается ErrorBoundary).
 * Per-page error.tsx override'ят этот fallback.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundary error={error} reset={reset} />
}
