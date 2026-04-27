import { FinalCtaSection } from '@/components/marketing/sections/final-cta'
import { ForCompaniesSection } from '@/components/marketing/sections/for-companies'
import { ForOperatorsSection } from '@/components/marketing/sections/for-operators'
import { HeroSection } from '@/components/marketing/sections/hero'
import { HowItWorksSection } from '@/components/marketing/sections/how-it-works'
import { PainPointsSection } from '@/components/marketing/sections/pain-points'
import { SurveysSection } from '@/components/marketing/sections/surveys'
import { WhyJumixSection } from '@/components/marketing/sections/why-jumix'
import { landingMetadata, organizationJsonLd, websiteJsonLd } from '@/lib/marketing-metadata'
import type { Metadata } from 'next'

export const metadata: Metadata = landingMetadata()

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <PainPointsSection />
      <ForCompaniesSection />
      <ForOperatorsSection />
      <HowItWorksSection />
      <WhyJumixSection />
      <SurveysSection />
      <FinalCtaSection />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: structured data
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([organizationJsonLd(), websiteJsonLd()]),
        }}
      />
    </>
  )
}
