import { render, screen } from '@testing-library/react'
import { Building2 } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { StatCard } from './stat-card'

describe('StatCard', () => {
  it('renders label', () => {
    render(<StatCard icon={Building2} label="Организации" value={12} />)
    expect(screen.getByText('Организации')).toBeInTheDocument()
  })

  it('renders NumberCounter span (not skeleton) when not loading', () => {
    const { container } = render(<StatCard icon={Building2} label="Orgs" value={7} />)
    expect(container.querySelector('.font-mono-numbers')).toBeInTheDocument()
  })

  it('renders skeleton when loading=true', () => {
    render(<StatCard icon={Building2} label="Orgs" value={0} loading />)
    expect(screen.getByRole('status', { name: 'Загрузка…' })).toBeInTheDocument()
  })

  it('accent="brand" applies brand border on card', () => {
    const { container } = render(<StatCard icon={Building2} label="New" value={3} accent="brand" />)
    expect(container.querySelector('.border-brand-500\\/40')).toBeInTheDocument()
  })

  it('no accent → default border-border-subtle (no brand class)', () => {
    const { container } = render(<StatCard icon={Building2} label="Orgs" value={0} />)
    expect(container.querySelector('.border-brand-500\\/40')).toBeNull()
  })

  it('wraps body in <a> when href provided', () => {
    render(<StatCard icon={Building2} label="Orgs" value={1} href="/organizations" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/organizations')
  })

  it('does not render link when href is omitted', () => {
    render(<StatCard icon={Building2} label="Orgs" value={1} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
