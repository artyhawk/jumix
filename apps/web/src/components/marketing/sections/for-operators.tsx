'use client'

import { AnimatedSection } from '@/components/marketing/animated-section'
import { SectionContainer } from '@/components/marketing/section-container'
import { SectionHeading } from '@/components/marketing/section-heading'
import { StaggerItem, StaggeredChildren } from '@/components/marketing/staggered-children'
import { PhoneMockup } from '@/components/marketing/visuals/phone-mockup'
import { useT, useTList } from '@/lib/marketing-locale'

interface Item {
  title: string
  description: string
}

export function ForOperatorsSection() {
  const t = useT()
  const tList = useTList<Item>()
  const items = tList('marketing.forOperators.items')

  return (
    <SectionContainer id="for-operators" className="relative bg-[var(--m-surface)]/40">
      <div className="grid gap-12 sm:gap-16 lg:gap-20 lg:grid-cols-[1fr_1.1fr] items-start">
        <div className="lg:sticky lg:top-28 space-y-8 sm:space-y-10">
          <AnimatedSection>
            <SectionHeading
              overline={t('marketing.forOperators.overline')}
              title={t('marketing.forOperators.title')}
              subtitle={t('marketing.forOperators.subtitle')}
              align="left"
            />
          </AnimatedSection>

          <AnimatedSection delay={0.15}>
            <div className="hidden lg:flex justify-center">
              <PhoneMockup />
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.2}>
            <div className="rounded-[14px] border border-[var(--m-border)] bg-[var(--m-surface)] p-4 sm:p-5">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--m-brand)] font-semibold">
                Итог
              </div>
              <p className="mt-2 text-[15px] text-[var(--m-fg)] leading-relaxed">
                {t('marketing.forOperators.outcome')}
              </p>
            </div>
          </AnimatedSection>
        </div>

        <StaggeredChildren className="space-y-4">
          {items.map((item, idx) => (
            <StaggerItem key={item.title} index={idx}>
              <article className="m-card m-card-glow p-4 sm:p-5 md:p-6 flex gap-3 sm:gap-4 items-start">
                <span
                  aria-hidden
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--m-brand-glow)] text-[var(--m-brand)] text-[13px] font-semibold tabular-nums"
                >
                  {(idx + 1).toString().padStart(2, '0')}
                </span>
                <div className="space-y-1.5 min-w-0">
                  <h3 className="text-[16px] font-semibold leading-snug text-[var(--m-fg)]">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[var(--m-fg-secondary)] leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </article>
            </StaggerItem>
          ))}
        </StaggeredChildren>
      </div>

      <div className="lg:hidden mt-10 sm:mt-12 flex justify-center">
        <AnimatedSection>
          <PhoneMockup />
        </AnimatedSection>
      </div>
    </SectionContainer>
  )
}
