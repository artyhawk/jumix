import type { MeStatusMembership } from '@jumix/shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MeMembershipsSummary } from './me-memberships-summary'

function m(overrides: Partial<MeStatusMembership> = {}): MeStatusMembership {
  return {
    id: 'h1',
    organizationId: 'o1',
    organizationName: 'СтройТехКран',
    approvalStatus: 'approved',
    status: 'active',
    hiredAt: '2026-03-01T00:00:00Z',
    approvedAt: '2026-03-02T00:00:00Z',
    rejectedAt: null,
    terminatedAt: null,
    rejectionReason: null,
    ...overrides,
  }
}

describe('MeMembershipsSummary', () => {
  it('empty → EmptyState с helpful hint', () => {
    render(<MeMembershipsSummary memberships={[]} />)
    expect(screen.getByText('Пока нет трудоустройств')).toBeInTheDocument()
    expect(
      screen.getByText('Вам нужен владелец организации, который подаст заявку на ваш найм.'),
    ).toBeInTheDocument()
  })

  it('3 items → список без «Все компании» link', () => {
    render(
      <MeMembershipsSummary memberships={[m({ id: 'h1' }), m({ id: 'h2' }), m({ id: 'h3' })]} />,
    )
    expect(screen.queryByText(/Все компании/)).not.toBeInTheDocument()
  })

  it('> 3 items → показывает link с total count', () => {
    const onViewAll = vi.fn()
    render(
      <MeMembershipsSummary
        memberships={[
          m({ id: '1' }),
          m({ id: '2' }),
          m({ id: '3' }),
          m({ id: '4' }),
          m({ id: '5' }),
        ]}
        onViewAll={onViewAll}
      />,
    )
    const link = screen.getByText('Все компании (5) →')
    expect(link).toBeInTheDocument()
    fireEvent.click(link)
    expect(onViewAll).toHaveBeenCalledOnce()
  })

  it('counter с русской множественной формой', () => {
    render(
      <MeMembershipsSummary
        memberships={[
          m({ id: '1', approvalStatus: 'approved', status: 'active' }),
          m({ id: '2', approvalStatus: 'pending', status: 'active' }),
          m({ id: '3', approvalStatus: 'approved', status: 'blocked' }),
        ]}
      />,
    )
    expect(screen.getByText(/1 из 3 организации активно/)).toBeInTheDocument()
  })
})
