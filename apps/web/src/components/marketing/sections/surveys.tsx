'use client'

import { AnimatedSection } from '@/components/marketing/animated-section'
import { SectionContainer } from '@/components/marketing/section-container'
import { SectionHeading } from '@/components/marketing/section-heading'
import { StaggerItem, StaggeredChildren } from '@/components/marketing/staggered-children'
import { useLocale, useT } from '@/lib/marketing-locale'
import { cn } from '@/lib/utils'
import { ArrowRight, Building2, HardHat } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Surveys section (B3-SURVEY). Two cards routing к public surveys.
 * Locale-aware: ru-locale → b2b-ru / b2c-ru; kz-locale → b2b-kk / b2c-kk.
 * (kk и kz — синонимы в нашем codebase: marketing-locale хранит 'kz', backend
 * использует ISO 639-1 'kk'; survey slugs соответствуют backend convention).
 */
export function SurveysSection() {
  const t = useT()
  const { locale } = useLocale()

  const isKk = locale === 'kz'
  const b2bSlug = isKk ? 'b2b-kk' : 'b2b-ru'
  const b2cSlug = isKk ? 'b2c-kk' : 'b2c-ru'

  return (
    <SectionContainer id="surveys" className="relative">
      <AnimatedSection>
        <SectionHeading
          overline={t('marketing.surveys.overline')}
          title={t('marketing.surveys.title')}
          subtitle={t('marketing.surveys.subtitle')}
        />
      </AnimatedSection>

      <StaggeredChildren className="mt-10 sm:mt-12 md:mt-16 grid gap-4 sm:gap-5 md:gap-6 md:grid-cols-2">
        <StaggerItem index={0}>
          <SurveyCard
            icon={<Building2 className="size-6" aria-hidden />}
            title={t('marketing.surveys.forCompanies.title')}
            description={t('marketing.surveys.forCompanies.description')}
            duration={t('marketing.surveys.forCompanies.duration')}
            ctaLabel={t('marketing.surveys.forCompanies.cta')}
            href={`/survey/${b2bSlug}`}
          />
        </StaggerItem>
        <StaggerItem index={1}>
          <SurveyCard
            icon={<HardHat className="size-6" aria-hidden />}
            title={t('marketing.surveys.forOperators.title')}
            description={t('marketing.surveys.forOperators.description')}
            duration={t('marketing.surveys.forOperators.duration')}
            ctaLabel={t('marketing.surveys.forOperators.cta')}
            href={`/survey/${b2cSlug}`}
          />
        </StaggerItem>
      </StaggeredChildren>
    </SectionContainer>
  )
}

function SurveyCard({
  icon,
  title,
  description,
  duration,
  ctaLabel,
  href,
}: {
  icon: ReactNode
  title: string
  description: string
  duration: string
  ctaLabel: string
  href: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative m-card m-card-glow p-5 sm:p-7 md:p-9 h-full flex flex-col gap-4 sm:gap-5',
        'transition-transform duration-300 hover:-translate-y-1',
      )}
    >
      <div
        aria-hidden
        className="absolute -top-12 -right-12 size-44 rounded-full opacity-50 blur-3xl pointer-events-none"
        style={{ background: 'var(--m-brand-glow)' }}
      />
      <div
        aria-hidden
        className="inline-flex size-12 items-center justify-center rounded-[14px] bg-[color:var(--m-brand-glow)] text-[var(--m-brand)] relative"
      >
        {icon}
      </div>
      <div className="space-y-2 relative">
        <h3
          className="font-semibold tracking-tight text-[var(--m-fg)] m-text-balance"
          style={{ fontSize: 'clamp(1.125rem, 0.9vw + 0.85rem, 1.375rem)', lineHeight: 1.2 }}
        >
          {title}
        </h3>
        <p className="text-[14px] text-[var(--m-fg-secondary)] leading-relaxed">{description}</p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-2 relative">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-[var(--m-border-strong)]',
            'bg-[var(--m-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--m-fg-tertiary)]',
            'tracking-wide',
          )}
        >
          {duration}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--m-brand)] group-hover:gap-2 transition-all duration-200">
          {ctaLabel}
          <ArrowRight className="size-[16px]" aria-hidden />
        </span>
      </div>
    </Link>
  )
}
