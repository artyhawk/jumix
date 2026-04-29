import { MarketingLocaleProvider } from '@/lib/marketing-locale'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { SurveysSection } from './surveys'

function withLocale(children: ReactNode) {
  return <MarketingLocaleProvider>{children}</MarketingLocaleProvider>
}

describe('SurveysSection', () => {
  it('renders both CTA cards', () => {
    render(withLocale(<SurveysSection />))
    expect(screen.getByText(/Опрос для компаний/i)).toBeInTheDocument()
    expect(screen.getByText(/Опрос для крановых/i)).toBeInTheDocument()
  })

  it('routes к ru-locale slugs by default', () => {
    render(withLocale(<SurveysSection />))
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/survey/b2b-ru')
    expect(hrefs).toContain('/survey/b2c-ru')
  })

  it('shows duration badges', () => {
    render(withLocale(<SurveysSection />))
    expect(screen.getByText('10–15 минут')).toBeInTheDocument()
    expect(screen.getByText('5–10 минут')).toBeInTheDocument()
  })
})
