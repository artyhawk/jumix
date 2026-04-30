'use client'

import { ThemeProvider } from '@/lib/theme/theme-provider'
import { useThemeSync } from '@/lib/theme/use-theme-sync'
import type { ReactNode } from 'react'

/**
 * Root-level wrapper для theme infrastructure (B3-THEME).
 *
 * `<ThemeProvider>` — context state + apply class на <html>.
 * `<ThemeSync>` — fire-and-forget sync с DB для logged-in users.
 *
 * Sync вынесен в отдельный child-компонент чтобы вызвать `useThemeSync` из
 * Provider'а context'а (хук читает useTheme()), но не загромождать сам
 * Provider — он pure context.
 */
export function ThemeProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ThemeSync />
      {children}
    </ThemeProvider>
  )
}

function ThemeSync() {
  useThemeSync()
  return null
}
