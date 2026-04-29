'use client'

import { AnimatedSection } from '@/components/marketing/animated-section'
import { FeatureCard } from '@/components/marketing/feature-card'
import { SectionContainer } from '@/components/marketing/section-container'
import { SectionHeading } from '@/components/marketing/section-heading'
import { StaggerItem, StaggeredChildren } from '@/components/marketing/staggered-children'
import { useT, useTList } from '@/lib/marketing-locale'
import { AlertTriangle, Calculator, Clock4, FileSpreadsheet } from 'lucide-react'

const ICONS = [
  <FileSpreadsheet key="i1" className="size-5" aria-hidden />,
  <Clock4 key="i2" className="size-5" aria-hidden />,
  <AlertTriangle key="i3" className="size-5" aria-hidden />,
  <Calculator key="i4" className="size-5" aria-hidden />,
]

interface PainItem {
  title: string
  description: string
}

export function PainPointsSection() {
  const t = useT()
  const tList = useTList<PainItem>()
  const safeItems = tList('marketing.painPoints.items')

  return (
    <SectionContainer id="pain-points">
      <AnimatedSection>
        <SectionHeading
          overline={t('marketing.painPoints.overline')}
          title={t('marketing.painPoints.title')}
          subtitle={t('marketing.painPoints.subtitle')}
        />
      </AnimatedSection>

      <StaggeredChildren className="mt-12 md:mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {safeItems.map((item, idx) => (
          <StaggerItem key={item.title} index={idx}>
            <FeatureCard
              icon={ICONS[idx]}
              title={item.title}
              description={item.description}
              tone="danger"
            />
          </StaggerItem>
        ))}
      </StaggeredChildren>
    </SectionContainer>
  )
}
