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
})
