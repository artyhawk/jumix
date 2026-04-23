import type { MeStatusMembership } from '@/lib/api/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MembershipCard } from './membership-card'

function makeMembership(overrides: Partial<MeStatusMembership> = {}): MeStatusMembership {
  return {
    id: 'm-1',
    organizationId: 'org-1',
    organizationName: 'ТОО «Кран-Ходжа»',
    approvalStatus: 'approved',
    status: 'active',
    hiredAt: '2026-01-15',
    approvedAt: '2026-01-16T10:00:00Z',
    rejectedAt: null,
    terminatedAt: null,
    rejectionReason: null,
    ...overrides,
  }
}

describe('MembershipCard', () => {
  it('renders organization name + approved badge + active badge + hired date', () => {
    render(<MembershipCard membership={makeMembership()} />)
    expect(screen.getByText('ТОО «Кран-Ходжа»')).toBeInTheDocument()
    expect(screen.getByText('Одобрено')).toBeInTheDocument()
    expect(screen.getByText('Активен')).toBeInTheDocument()
    expect(screen.getByText(/Принят/)).toBeInTheDocument()
  })

  it('pending membership: operational status hidden', () => {
    render(
      <MembershipCard
        membership={makeMembership({ approvalStatus: 'pending', status: 'active' })}
      />,
    )
    expect(screen.getByText('Ожидает')).toBeInTheDocument()
    expect(screen.queryByText('Активен')).toBeNull()
  })

  it('rejected: rejection reason surfaced', () => {
    render(
      <MembershipCard
        membership={makeMembership({
          approvalStatus: 'rejected',
          rejectionReason: 'ИИН не соответствует',
          rejectedAt: '2026-02-20T12:00:00Z',
        })}
      />,
    )
    expect(screen.getByText('Отклонено')).toBeInTheDocument()
    expect(screen.getByText(/Причина отклонения/)).toBeInTheDocument()
    expect(screen.getByText(/ИИН не соответствует/)).toBeInTheDocument()
  })

  it('clickable variant fires onClick', async () => {
    const onClick = vi.fn()
    render(<MembershipCard membership={makeMembership()} onClick={onClick} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })

  it('non-clickable variant: no button role', () => {
    render(<MembershipCard membership={makeMembership()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('terminated hire shows Уволен label + terminated date', () => {
    render(
      <MembershipCard
        membership={makeMembership({
          approvalStatus: 'approved',
          status: 'terminated',
          terminatedAt: '2026-03-10',
        })}
      />,
    )
    expect(screen.getByText('Уволен')).toBeInTheDocument()
    expect(screen.getByText(/Уволен:/)).toBeInTheDocument()
  })
})
