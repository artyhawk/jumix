'use client'

import { LoginLink } from '@/components/marketing/login-link'
import { DashboardMockup } from '@/components/marketing/visuals/dashboard-mockup'
import { WhatsAppButton } from '@/components/marketing/whatsapp-button'
import { useT } from '@/lib/marketing-locale'
import { motion, useReducedMotion } from 'framer-motion'

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const

export function HeroSection() {
  const t = useT()
  const reduceMotion = useReducedMotion()

  const fadeUp = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, ease: PREMIUM_EASE, delay },
        }

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 m-radial-hero" aria-hidden />
      <div className="absolute inset-0 m-grid-bg" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-5 md:px-8 pt-12 pb-20 md:pt-20 md:pb-32">
        <div className="grid gap-12 lg:gap-16 lg:grid-cols-[1.05fr_1fr] items-center">
          <div>
            <motion.span
              {...fadeUp(0)}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--m-border-strong)] bg-[var(--m-surface)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--m-fg-secondary)]"
            >
              <span className="size-1.5 rounded-full bg-[var(--m-brand)]" />
              {t('marketing.hero.tagline')}
            </motion.span>

            <motion.h1
              {...fadeUp(0.1)}
              className="mt-6 font-semibold tracking-tight m-text-balance text-[var(--m-fg)]"
              style={{
                fontSize: 'clamp(2.25rem, 4vw + 1rem, 4.25rem)',
                lineHeight: 1.05,
              }}
            >
              {t('marketing.hero.title')}
            </motion.h1>

            <motion.p
              {...fadeUp(0.2)}
              className="mt-6 text-[16px] md:text-[18px] text-[var(--m-fg-secondary)] leading-relaxed max-w-xl m-text-balance"
            >
              {t('marketing.hero.subtitle')}
            </motion.p>

            <motion.div
              {...fadeUp(0.3)}
              className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
            >
              <WhatsAppButton variant="primary" size="lg" />
              <LoginLink variant="outline" size="lg" label={t('marketing.hero.ctaSecondary')} />
            </motion.div>

            <motion.p
              {...fadeUp(0.4)}
              className="mt-6 text-[12px] text-[var(--m-fg-tertiary)] tracking-wide"
            >
              {t('marketing.hero.trustLine')}
            </motion.p>
          </div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: PREMIUM_EASE, delay: 0.4 }}
            className="lg:pl-4"
          >
            <DashboardMockup />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
