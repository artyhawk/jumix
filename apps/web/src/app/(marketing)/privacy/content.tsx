'use client'

import { useT } from '@/lib/marketing-locale'
import Link from 'next/link'

const SECTION_KEYS = [1, 2, 3, 4, 5, 6, 7] as const

export function PrivacyContent() {
  const t = useT()
  return (
    <article className="mx-auto max-w-3xl px-5 md:px-8 py-16 md:py-24">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)] transition-colors"
      >
        <span aria-hidden>←</span> На главную
      </Link>

      <header className="mt-8 space-y-3">
        <h1
          className="font-semibold tracking-tight text-[var(--m-fg)]"
          style={{ fontSize: 'clamp(1.75rem, 2vw + 1.25rem, 2.5rem)', lineHeight: 1.15 }}
        >
          {t('marketing.privacy.title')}
        </h1>
        <p className="text-sm text-[var(--m-fg-tertiary)]">{t('marketing.privacy.lastUpdated')}</p>
      </header>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-[var(--m-fg-secondary)]">
        <p>{t('marketing.privacy.intro')}</p>

        {SECTION_KEYS.map((n) => (
          <section key={n} className="space-y-2">
            <h2 className="text-[18px] font-semibold text-[var(--m-fg)]">
              {t(`marketing.privacy.section${n}Title`)}
            </h2>
            <p>{t(`marketing.privacy.section${n}Body`)}</p>
          </section>
        ))}

        <section className="space-y-2 pt-4 border-t border-[var(--m-border)]">
          <h2 className="text-[18px] font-semibold text-[var(--m-fg)]">
            {t('marketing.privacy.contactTitle')}
          </h2>
          <p>{t('marketing.privacy.contactBody')}</p>
        </section>

        {/* TODO(legal): Документ требует юридической редактуры перед публичным запуском
            (M8 store submission). Текущий текст — boilerplate шаблон. */}
        <p className="text-xs text-[var(--m-fg-tertiary)] italic pt-4">
          {t('marketing.privacy.legalNotice')}
        </p>
      </div>
    </article>
  )
}
