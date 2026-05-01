'use client'

import { AnimatedSection } from '@/components/marketing/animated-section'
import { SectionContainer } from '@/components/marketing/section-container'
import { SectionHeading } from '@/components/marketing/section-heading'
import { StaggerItem, StaggeredChildren } from '@/components/marketing/staggered-children'
import { StepIllustration } from '@/components/marketing/visuals/step-illustration'
import { useT, useTList } from '@/lib/marketing-locale'

interface Step {
  label: string
  title: string
  description: string
}

export function HowItWorksSection() {
  const t = useT()
  const tList = useTList<Step>()
  const steps = tList('marketing.howItWorks.steps').slice(0, 3)

  return (
    <SectionContainer id="how-it-works">
      <AnimatedSection>
        <SectionHeading
          overline={t('marketing.howItWorks.overline')}
          title={t('marketing.howItWorks.title')}
          subtitle={t('marketing.howItWorks.subtitle')}
        />
      </AnimatedSection>

      <StaggeredChildren className="mt-10 sm:mt-12 md:mt-16 grid gap-4 sm:gap-6 md:grid-cols-3 relative">
        {/* Connecting line — desktop only */}
        <div
          className="hidden md:block absolute top-[88px] left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-[var(--m-border-strong)] to-transparent"
          aria-hidden
        />

        {steps.map((step, idx) => (
          <StaggerItem key={step.label} index={idx}>
            <article className="relative m-card p-4 sm:p-6 md:p-7 h-full flex flex-col gap-4 sm:gap-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--m-brand)] font-semibold tabular-nums">
                  {step.label}
                </span>
                <span
                  aria-hidden
                  className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--m-bg)] border border-[var(--m-border-strong)] text-[11px] tabular-nums text-[var(--m-fg-tertiary)]"
                >
                  {idx + 1}
                </span>
              </div>
              <StepIllustration variant={(idx + 1) as 1 | 2 | 3} className="mt-1" />
              <div className="space-y-2">
                <h3 className="text-[18px] font-semibold leading-snug text-[var(--m-fg)]">
                  {step.title}
                </h3>
                <p className="text-sm text-[var(--m-fg-secondary)] leading-relaxed">
                  {step.description}
                </p>
              </div>
            </article>
          </StaggerItem>
        ))}
      </StaggeredChildren>
    </SectionContainer>
  )
}
