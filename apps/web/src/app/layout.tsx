import { ThemeScript } from '@/components/theme-script'
import { AuthProvider } from '@/providers/auth-provider'
import { QueryProvider } from '@/providers/query-provider'
import { ThemeProviders } from '@/providers/theme-providers'
import { ToastProvider } from '@/providers/toast-provider'
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-mono-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Jumix',
    template: '%s · Jumix',
  },
  description: 'Jumix — платформа управления крановыми',
  icons: {
    icon: '/brand/logo-mark.png',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        {/* B3-THEME — inline script читает localStorage и ставит class на <html>
            ДО React hydrate (FOUC prevention). См. theme-script.tsx. */}
        <ThemeScript />
      </head>
      <body className="antialiased">
        <ThemeProviders>
          <QueryProvider>
            <AuthProvider>{children}</AuthProvider>
          </QueryProvider>
          <ToastProvider />
        </ThemeProviders>
      </body>
    </html>
  )
}
