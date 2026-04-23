import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'

/**
 * Helper для тестов с TanStack Query hooks. Отключает retries чтобы
 * errored-queries не висели, но позволяет per-test override через
 * `createQueryWrapper({retry: 2})`.
 *
 * ВАЖНО: `gcTime: Infinity` — не чистим cache между hook-renders в одном
 * test'е (иначе rollback-assertions ломаются после invalidateQueries).
 */
export function createQueryWrapper(options?: {
  retry?: number | boolean
}): {
  wrapper: ({ children }: { children: ReactNode }) => ReactElement
  client: QueryClient
} {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: options?.retry ?? false,
        gcTime: Number.POSITIVE_INFINITY,
      },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { wrapper, client }
}
