'use client'

import { useT } from '@/lib/marketing-locale'
import Image from 'next/image'
import Link from 'next/link'
import { whatsappLink } from './whatsapp'

export function Footer() {
  const t = useT()
  return (
    <footer className="border-t border-[var(--m-border)] bg-[var(--m-bg)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8 py-12 sm:py-14 md:py-20">
        <div className="grid gap-8 sm:gap-12 md:grid-cols-4">
          <div className="md:col-span-2 max-w-md space-y-4">
            <Link href="/" className="inline-flex items-center gap-2 select-none">
              <Image
                src="/brand/logo-mark.png"
                alt=""
                aria-hidden
                width={28}
                height={28}
                className="object-contain shrink-0"
              />
              <span className="text-[var(--m-fg)] font-semibold text-[17px] tracking-tight leading-none">
                Jumix
              </span>
            </Link>
            <p className="text-sm text-[var(--m-fg-secondary)] leading-relaxed">
              {t('marketing.footer.tagline')}
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--m-fg-tertiary)] uppercase tracking-[0.08em]">
              {t('marketing.footer.contactsTitle')}
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href={t('marketing.footer.phoneHref')}
                  className="text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)] transition-colors"
                >
                  {t('marketing.footer.phone')}
                </a>
              </li>
              <li>
                <a
                  href={whatsappLink(t('marketing.whatsappMessage'))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)] transition-colors"
                >
                  {t('marketing.footer.whatsapp')}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${t('marketing.footer.email')}`}
                  className="text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)] transition-colors"
                >
                  {t('marketing.footer.email')}
                </a>
              </li>
              <li className="text-[var(--m-fg-tertiary)]">{t('marketing.footer.city')}</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--m-fg-tertiary)] uppercase tracking-[0.08em]">
              {t('marketing.footer.legalTitle')}
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/privacy"
                  className="text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)] transition-colors"
                >
                  {t('marketing.footer.privacy')}
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)] transition-colors"
                >
                  {t('marketing.footer.terms')}
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  prefetch={false}
                  className="text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)] transition-colors"
                >
                  {t('marketing.footer.navLogin')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="m-divider mt-14 md:mt-20" />
        <div className="pt-6 text-xs text-[var(--m-fg-tertiary)]">
          {t('marketing.footer.copyright')}
        </div>
      </div>
    </footer>
  )
}
