'use client'

import { AnimatedSection } from '@/components/marketing/animated-section'
import { LoginLink } from '@/components/marketing/login-link'
import { SectionContainer } from '@/components/marketing/section-container'
import { WhatsAppButton } from '@/components/marketing/whatsapp-button'
import { useT } from '@/lib/marketing-locale'

export function FinalCtaSection() {
  const t = useT()
  return (
    <SectionContainer id="final-cta" className="relative">
      <AnimatedSection>
        <div className="relative mx-auto max-w-4xl rounded-[28px] border border-[var(--m-border-strong)] bg-gradient-to-b from-[var(--m-surface-elevated)] to-[var(--m-surface)] px-6 py-16 md:px-12 md:py-24 overflow-hidden">
          {/* Glow */}
          <div
            className="absolute inset-0 opacity-70"
            style={{
              background:
                'radial-gradient(900px circle at 50% -20%, rgba(249,123,16,0.18) 0%, transparent 60%)',
            }}
            aria-hidden
          />
          <div className="absolute inset-0 m-grid-bg opacity-50" aria-hidden />

          <div className="relative text-center space-y-5">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--m-brand)]">
              <span className="size-1 rounded-full bg-[var(--m-brand)]" aria-hidden />
              {t('marketing.finalCta.overline')}
            </span>
            <h2
              className="font-semibold tracking-tight m-text-balance text-[var(--m-fg)] mx-auto max-w-2xl"
              style={{
                fontSize: 'clamp(1.75rem, 2.4vw + 1.25rem, 3rem)',
                lineHeight: 1.1,
              }}
            >
              {t('marketing.finalCta.title')}
            </h2>
            <p className="mx-auto max-w-xl text-[15px] md:text-[17px] text-[var(--m-fg-secondary)] leading-relaxed m-text-balance">
              {t('marketing.finalCta.subtitle')}
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <WhatsAppButton variant="primary" size="lg">
                {t('marketing.finalCta.ctaWhatsApp')}
              </WhatsAppButton>
              <LoginLink variant="ghost" size="lg" label={t('marketing.finalCta.ctaLogin')} />
            </div>

            <p className="pt-2 text-[13px] text-[var(--m-fg-tertiary)]">
              {t('marketing.finalCta.phoneNote')}
            </p>
          </div>
        </div>
      </AnimatedSection>
    </SectionContainer>
  )
}
