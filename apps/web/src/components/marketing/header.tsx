'use client'

import { useT } from '@/lib/marketing-locale'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { LocaleSwitcher } from './locale-switcher'
import { LoginLink } from './login-link'
import { WhatsAppButton } from './whatsapp-button'

const NAV_LINKS = [
  { href: '#for-companies', key: 'features' as const },
  { href: '#for-operators', key: 'operators' as const },
  { href: '#how-it-works', key: 'howItWorks' as const },
]

export function Header() {
  const t = useT()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-[background,backdrop-filter,border-color] duration-300',
        scrolled
          ? 'bg-[var(--m-bg)]/80 backdrop-blur-md border-b border-[var(--m-border)]'
          : 'bg-transparent border-b border-transparent',
      )}
    >
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="h-16 md:h-20 flex items-center justify-between gap-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)] rounded-md"
            aria-label="Jumix"
          >
            <Image
              src="/brand/logo-mark.png"
              alt=""
              aria-hidden
              width={28}
              height={28}
              priority
              className="object-contain shrink-0"
            />
            <span className="text-[var(--m-fg)] font-semibold text-[17px] tracking-tight leading-none">
              Jumix
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8" aria-label="Главная навигация">
            {NAV_LINKS.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className="text-sm text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)] transition-colors"
              >
                {t(`marketing.nav.${link.key}`)}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 md:gap-2">
            <LocaleSwitcher />
            <LoginLink variant="ghost" size="md" className="hidden sm:inline-flex" />
            <WhatsAppButton variant="primary" size="md">
              {t('marketing.nav.contact')}
            </WhatsAppButton>
          </div>
        </div>
      </div>
    </header>
  )
}
