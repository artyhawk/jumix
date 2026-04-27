import { Footer } from '@/components/marketing/footer'
import { Header } from '@/components/marketing/header'
import { MarketingLocaleProvider } from '@/lib/marketing-locale'
import type { ReactNode } from 'react'
import './marketing.css'

/**
 * Public marketing route group (B3-LANDING). Не требует auth, отдельный visual
 * language от admin cabinet (deeper dark, generous spacing, premium animations).
 * `data-marketing` атрибут на body — scope для marketing.css переменных.
 * `MarketingLocaleProvider` — client-side store ru/kz/en (localStorage persist),
 * scoped только marketing-subtree (admin cabinet остаётся locale-agnostic).
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingLocaleProvider>
      <div data-marketing="true" className="min-h-dvh flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </MarketingLocaleProvider>
  )
}
