'use client'

import { LocaleSwitcher } from '@/components/marketing/locale-switcher'
import { LoginLink } from '@/components/marketing/login-link'
import { MarketingThemeToggle } from '@/components/marketing/theme-toggle'
import { WhatsAppButton } from '@/components/marketing/whatsapp-button'
import { useT } from '@/lib/marketing-locale'
import { cn } from '@/lib/utils'
import * as RadixDialog from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV_LINKS = [
  { href: '#for-companies', key: 'features' as const },
  { href: '#for-operators', key: 'operators' as const },
  { href: '#how-it-works', key: 'howItWorks' as const },
]

/**
 * Marketing mobile burger menu (<md). Trigger в header'е, drawer rendered через
 * Radix Dialog Portal. Закрывается на pathname change (для якорей #-section и
 * перехода на /login). Внутри: NAV_LINKS (только на главной), Theme toggle,
 * Locale switcher, LoginLink, WhatsApp CTA. Theme/Locale/LoginLink в header
 * скрыты на phone через `hidden md:inline-flex` — здесь их единственная
 * точка доступа на мобиле.
 */
export function MarketingMobileMenu({ className }: { className?: string }) {
  const t = useT()
  const pathname = usePathname()
  const isHome = pathname === '/'
  const [open, setOpen] = useState(false)

  // Auto-close на навигацию (anchor click → hash change в pathname)
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger only on pathname change
  useEffect(() => {
    if (open) setOpen(false)
  }, [pathname])

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Trigger asChild>
        <button
          type="button"
          aria-label="Открыть меню"
          className={cn(
            'inline-flex md:hidden items-center justify-center size-10 rounded-md',
            'text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)]',
            'hover:bg-[var(--m-surface)] transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)]',
            className,
          )}
        >
          <Menu className="size-5" strokeWidth={1.5} aria-hidden />
        </button>
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          data-marketing="true"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm anim-fade md:hidden"
        />
        <RadixDialog.Content
          data-marketing="true"
          aria-label="Навигация"
          className={cn(
            'fixed inset-y-0 right-0 z-50 h-dvh w-[280px] max-w-[calc(100vw-48px)]',
            'bg-[var(--m-surface-elevated)] border-l border-[var(--m-border-strong)]',
            'shadow-2xl anim-slide-right flex flex-col focus:outline-none md:hidden',
          )}
        >
          <RadixDialog.Title className="sr-only">Меню</RadixDialog.Title>
          <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--m-border)]">
            <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--m-fg-tertiary)]">
              Меню
            </span>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label="Закрыть меню"
                className="inline-flex size-9 items-center justify-center rounded-md text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)] hover:bg-[var(--m-surface)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)]"
              >
                <X className="size-5" strokeWidth={1.5} aria-hidden />
              </button>
            </RadixDialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5">
            {isHome ? (
              <nav aria-label="Разделы" className="flex flex-col">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="py-3 text-[15px] text-[var(--m-fg)] hover:text-[var(--m-brand)] transition-colors border-b border-[var(--m-border)] last:border-0"
                  >
                    {t(`marketing.nav.${link.key}`)}
                  </a>
                ))}
              </nav>
            ) : null}

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-[var(--m-fg-secondary)]">Тема</span>
                <MarketingThemeToggle />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-[var(--m-fg-secondary)]">Язык</span>
                <LocaleSwitcher />
              </div>
            </div>
          </div>

          <div className="px-4 py-4 border-t border-[var(--m-border)] flex flex-col gap-2.5">
            <LoginLink variant="outline" size="md" className="w-full" />
            <WhatsAppButton variant="primary" size="md" className="w-full">
              {t('marketing.nav.contact')}
            </WhatsAppButton>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
