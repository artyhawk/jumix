import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LicenseStatusBadge } from './license-status-badge'

describe('LicenseStatusBadge', () => {
  it('renders valid', () => {
    render(<LicenseStatusBadge status="valid" />)
    expect(screen.getByText('Действует')).toBeInTheDocument()
  })

  it('renders missing', () => {
    render(<LicenseStatusBadge status="missing" />)
    expect(screen.getByText('Нет')).toBeInTheDocument()
  })

  it('renders expiring_soon and expiring_critical with same label', () => {
    const { rerender } = render(<LicenseStatusBadge status="expiring_soon" />)
    expect(screen.getByText('Истекает')).toBeInTheDocument()
    rerender(<LicenseStatusBadge status="expiring_critical" />)
    expect(screen.getByText('Истекает')).toBeInTheDocument()
  })

  it('renders expired', () => {
    render(<LicenseStatusBadge status="expired" />)
    expect(screen.getByText('Просрочено')).toBeInTheDocument()
  })

  it('enriched valid: shows "Действует · до <date>"', () => {
    render(<LicenseStatusBadge status="valid" enriched expiresAt="2027-04-20" />)
    expect(screen.getByText(/Действует · до 20 апреля 2027/)).toBeInTheDocument()
  })

  it('enriched expiring_soon: shows "Истекает · через N дней"', () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 14)
    const iso = soon.toISOString().slice(0, 10)
    render(<LicenseStatusBadge status="expiring_soon" enriched expiresAt={iso} />)
    expect(screen.getByText(/Истекает · через 14 дней/)).toBeInTheDocument()
  })

  it('enriched expired: shows "Просрочено · N дней назад"', () => {
    const past = new Date()
    past.setDate(past.getDate() - 5)
    const iso = past.toISOString().slice(0, 10)
    render(<LicenseStatusBadge status="expired" enriched expiresAt={iso} />)
    expect(screen.getByText(/Просрочено · 5 дней назад/)).toBeInTheDocument()
  })

  it('enriched без expiresAt falls back to compact label', () => {
    render(<LicenseStatusBadge status="valid" enriched />)
    expect(screen.getByText('Действует')).toBeInTheDocument()
  })
})
