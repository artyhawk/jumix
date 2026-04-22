import type { OrganizationOperator } from '@/lib/api/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HireApprovalRow } from './hire-approval-row'

function makeHire(overrides: Partial<OrganizationOperator> = {}): OrganizationOperator {
  return {
    id: 'h-1',
    craneProfileId: 'cp-1',
    organizationId: 'org-1',
    craneProfile: {
      id: 'cp-1',
      firstName: 'Арман',
      lastName: 'Канатов',
      patronymic: null,
      iin: '900202300002',
      avatarUrl: null,
      licenseStatus: 'valid',
    },
    hiredAt: null,
    terminatedAt: null,
    status: 'active',
    availability: null,
    approvalStatus: 'pending',
    rejectionReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('HireApprovalRow', () => {
  it('renders full name + organization', () => {
    render(
      <HireApprovalRow
        hire={makeHire()}
        organizationName="TELSE ТОО"
        onApprove={() => {}}
        onReject={() => {}}
      />,
    )
    expect(screen.getByText('Канатов Арман')).toBeInTheDocument()
    expect(screen.getByText('TELSE ТОО')).toBeInTheDocument()
  })

  it('falls back to organizationId when name not provided', () => {
    render(<HireApprovalRow hire={makeHire()} onApprove={() => {}} onReject={() => {}} />)
    expect(screen.getByText('org-1')).toBeInTheDocument()
  })

  it('approve callback fires on click', async () => {
    const onApprove = vi.fn()
    render(<HireApprovalRow hire={makeHire()} onApprove={onApprove} onReject={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Одобрить' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons when pending', () => {
    render(<HireApprovalRow hire={makeHire()} onApprove={() => {}} onReject={() => {}} isPending />)
    expect(screen.getByRole('button', { name: 'Одобрить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeDisabled()
  })
})
