import { AnimatedSection } from '@/components/marketing/animated-section'
import { FeatureCard } from '@/components/marketing/feature-card'
import { SectionContainer } from '@/components/marketing/section-container'
import { SectionHeading } from '@/components/marketing/section-heading'
import { StaggerItem, StaggeredChildren } from '@/components/marketing/staggered-children'
import { t, tList } from '@/lib/i18n'
import { BarChart3, Calculator, LayoutDashboard, MapPin, Star, Zap } from 'lucide-react'

const ICONS = [
  <LayoutDashboard key="i1" className="size-5" aria-hidden />,
  <MapPin key="i2" className="size-5" aria-hidden />,
  <Calculator key="i3" className="size-5" aria-hidden />,
  <Zap key="i4" className="size-5" aria-hidden />,
  <Star key="i5" className="size-5" aria-hidden />,
  <BarChart3 key="i6" className="size-5" aria-hidden />,
]

interface Item {
  title: string
  description: string
}

export function ForCompaniesSection() {
  const items = tList<Item>('marketing.forCompanies.items')

  return (
    <SectionContainer id="for-companies" className="relative">
      <AnimatedSection>
        <SectionHeading
          overline={t('marketing.forCompanies.overline')}
          title={t('marketing.forCompanies.title')}
          subtitle={t('marketing.forCompanies.subtitle')}
        />
      </AnimatedSection>

      <StaggeredChildren className="mt-12 md:mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, idx) => (
          <StaggerItem key={item.title}>
            <FeatureCard icon={ICONS[idx]} title={item.title} description={item.description} />
          </StaggerItem>
        ))}
      </StaggeredChildren>

      <AnimatedSection delay={0.1}>
        <p className="mt-12 md:mt-16 mx-auto max-w-2xl text-center text-[15px] md:text-base text-[var(--m-fg-secondary)] leading-relaxed m-text-balance">
          <span className="text-[var(--m-fg)] font-medium">Итог: </span>
          {t('marketing.forCompanies.outcome')}
        </p>
      </AnimatedSection>
    </SectionContainer>
  )
}
