import type { CraneProfile } from '@/lib/api/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CraneProfileApprovalRow } from './crane-profile-approval-row'

function makeProfile(overrides: Partial<CraneProfile> = {}): CraneProfile {
  return {
    id: 'p-1',
    userId: 'u-1',
    firstName: 'Иван',
    lastName: 'Иванов',
    patronymic: 'Петрович',
    iin: '900101300001',
    phone: '+77010000001',
    avatarUrl: null,
    approvalStatus: 'pending',
    rejectionReason: null,
    approvedAt: null,
    rejectedAt: null,
    licenseStatus: 'missing',
    licenseExpiresAt: null,
    licenseUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('CraneProfileApprovalRow', () => {
  it('renders full name (lastName + firstName + patronymic)', () => {
    render(
      <CraneProfileApprovalRow profile={makeProfile()} onApprove={() => {}} onReject={() => {}} />,
    )
    expect(screen.getByText('Иванов Иван Петрович')).toBeInTheDocument()
  })

  it('renders IIN', () => {
    render(
      <CraneProfileApprovalRow profile={makeProfile()} onApprove={() => {}} onReject={() => {}} />,
    )
    expect(screen.getByText('900101300001')).toBeInTheDocument()
  })

  it('calls onApprove when approve button clicked', async () => {
    const onApprove = vi.fn()
    render(
      <CraneProfileApprovalRow profile={makeProfile()} onApprove={onApprove} onReject={() => {}} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Одобрить' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('calls onReject when reject button clicked', async () => {
    const onReject = vi.fn()
    render(
      <CraneProfileApprovalRow profile={makeProfile()} onApprove={() => {}} onReject={onReject} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Отклонить' }))
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons when isPending', () => {
    render(
      <CraneProfileApprovalRow
        profile={makeProfile()}
        onApprove={() => {}}
        onReject={() => {}}
        isPending
      />,
    )
    expect(screen.getByRole('button', { name: 'Одобрить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeDisabled()
  })

  it('renders fullname with null patronymic', () => {
    render(
      <CraneProfileApprovalRow
        profile={makeProfile({ patronymic: null })}
        onApprove={() => {}}
        onReject={() => {}}
      />,
    )
    expect(screen.getByText('Иванов Иван')).toBeInTheDocument()
  })
})
