import { AnimatedSection } from '@/components/marketing/animated-section'
import { SectionContainer } from '@/components/marketing/section-container'
import { SectionHeading } from '@/components/marketing/section-heading'
import { StaggerItem, StaggeredChildren } from '@/components/marketing/staggered-children'
import { t, tList } from '@/lib/i18n'
import { Eye, Gauge, Network, ShieldCheck, Sparkles } from 'lucide-react'

const ICONS = [
  <Sparkles key="i1" className="size-5" aria-hidden />,
  <Eye key="i2" className="size-5" aria-hidden />,
  <Gauge key="i3" className="size-5" aria-hidden />,
  <ShieldCheck key="i4" className="size-5" aria-hidden />,
  <Network key="i5" className="size-5" aria-hidden />,
]

interface Item {
  title: string
  description: string
}

export function WhyJumixSection() {
  const items = tList<Item>('marketing.whyJumix.items')
  const [primary, ...rest] = items

  return (
    <SectionContainer id="why-jumix" className="relative">
      <AnimatedSection>
        <SectionHeading
          overline={t('marketing.whyJumix.overline')}
          title={t('marketing.whyJumix.title')}
          subtitle={t('marketing.whyJumix.subtitle')}
        />
      </AnimatedSection>

      <StaggeredChildren className="mt-12 md:mt-16 grid gap-4 md:grid-cols-6 auto-rows-fr">
        {primary ? (
          <StaggerItem className="md:col-span-3 md:row-span-2">
            <article className="m-card m-card-glow p-7 md:p-9 h-full flex flex-col gap-5 relative overflow-hidden">
              <div
                className="absolute -top-12 -right-12 size-48 rounded-full opacity-50 blur-3xl"
                style={{ background: 'var(--m-brand-glow)' }}
                aria-hidden
              />
              <div
                aria-hidden
                className="inline-flex size-12 items-center justify-center rounded-[14px] bg-[color:var(--m-brand-glow)] text-[var(--m-brand)] relative"
              >
                {ICONS[0]}
              </div>
              <div className="space-y-3 relative">
                <h3
                  className="font-semibold tracking-tight text-[var(--m-fg)] m-text-balance"
                  style={{
                    fontSize: 'clamp(1.25rem, 1.4vw + 0.75rem, 1.75rem)',
                    lineHeight: 1.15,
                  }}
                >
                  {primary.title}
                </h3>
                <p className="text-[15px] text-[var(--m-fg-secondary)] leading-relaxed">
                  {primary.description}
                </p>
              </div>
            </article>
          </StaggerItem>
        ) : null}

        {rest.map((item, idx) => (
          <StaggerItem key={item.title} className="md:col-span-3">
            <article className="m-card m-card-glow p-6 md:p-7 h-full flex gap-4 items-start">
              <div
                aria-hidden
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--m-brand-glow)] text-[var(--m-brand)]"
              >
                {ICONS[idx + 1]}
              </div>
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
    </SectionContainer>
  )
}
