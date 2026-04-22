import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PendingAttentionCallout } from './pending-attention-callout'

describe('PendingAttentionCallout', () => {
  it('renders empty state (success icon + allClear text) when total pending is zero', () => {
    render(<PendingAttentionCallout craneProfiles={0} organizationOperators={0} cranes={0} />)
    expect(screen.getByText('Всё одобрено')).toBeInTheDocument()
    expect(screen.getByText('Нет заявок на рассмотрение')).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('renders three pending rows with links to /approvals tabs', () => {
    render(<PendingAttentionCallout craneProfiles={3} organizationOperators={2} cranes={1} />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/approvals?tab=crane-profiles',
        '/approvals?tab=hires',
        '/approvals?tab=cranes',
      ]),
    )
  })

  it('shows total count in subtitle', () => {
    render(<PendingAttentionCallout craneProfiles={3} organizationOperators={2} cranes={1} />)
    expect(screen.getByText(/— 6/)).toBeInTheDocument()
  })

  it('dims rows with zero count (opacity-60 class)', () => {
    const { container } = render(
      <PendingAttentionCallout craneProfiles={0} organizationOperators={5} cranes={0} />,
    )
    expect(container.querySelectorAll('.opacity-60').length).toBe(2)
  })

  it('applies brand border on wrapper card', () => {
    const { container } = render(
      <PendingAttentionCallout craneProfiles={1} organizationOperators={0} cranes={0} />,
    )
    expect(container.querySelector('.border-brand-500\\/30')).toBeInTheDocument()
  })

  it('renders individual counters as text', () => {
    render(<PendingAttentionCallout craneProfiles={7} organizationOperators={4} cranes={2} />)
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
