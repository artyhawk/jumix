import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LicenseWarningBanner } from './license-warning-banner'

describe('LicenseWarningBanner', () => {
  it('valid → null', () => {
    const { container } = render(<LicenseWarningBanner status="valid" expiresAt="2027-04-01" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('missing → null (обрабатывается LicenseCurrentCard)', () => {
    const { container } = render(<LicenseWarningBanner status="missing" expiresAt={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('expired → danger banner с title + countdown', () => {
    render(<LicenseWarningBanner status="expired" expiresAt="2024-01-01" />)
    expect(screen.getByText('Удостоверение просрочено')).toBeInTheDocument()
  })

  it('expiring_soon → warning banner', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 20)
    render(<LicenseWarningBanner status="expiring_soon" expiresAt={futureDate.toISOString()} />)
    expect(screen.getByText('Удостоверение скоро истечёт')).toBeInTheDocument()
  })
})
