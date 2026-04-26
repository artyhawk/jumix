import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LandingPage from './page'

describe('LandingPage', () => {
  it('renders all marketing sections via stable IDs', () => {
    const { container } = render(<LandingPage />)
    const ids = Array.from(container.querySelectorAll('[id]'))
      .map((el) => el.id)
      .filter(Boolean)

    expect(ids).toContain('pain-points')
    expect(ids).toContain('for-companies')
    expect(ids).toContain('for-operators')
    expect(ids).toContain('how-it-works')
    expect(ids).toContain('why-jumix')
    expect(ids).toContain('final-cta')
  })

  it('renders single h1 (hero) — heading hierarchy', () => {
    render(<LandingPage />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('renders hero CTAs (WhatsApp + login)', () => {
    render(<LandingPage />)
    expect(screen.getAllByTestId('whatsapp-button').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByTestId('login-link').length).toBeGreaterThanOrEqual(1)
  })

  it('emits Organization + WebSite JSON-LD', () => {
    const { container } = render(<LandingPage />)
    const ld = container.querySelector('script[type="application/ld+json"]')
    expect(ld).not.toBeNull()
    const parsed = JSON.parse(ld?.innerHTML ?? '[]') as Array<Record<string, unknown>>
    const types = parsed.map((p) => p['@type'])
    expect(types).toContain('Organization')
    expect(types).toContain('WebSite')
  })
})
