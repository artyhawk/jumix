import type { Crane } from '@/lib/api/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CraneApprovalRow } from './crane-approval-row'

function makeCrane(overrides: Partial<Crane> = {}): Crane {
  return {
    id: 'c-1',
    organizationId: 'org-1',
    siteId: null,
    type: 'tower',
    model: 'КБ-403',
    inventoryNumber: 'INV-001',
    capacityTon: 8,
    boomLengthM: 40,
    yearManufactured: 2018,
    status: 'active',
    approvalStatus: 'pending',
    rejectionReason: null,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('CraneApprovalRow', () => {
  it('renders model + inventory number + type + capacity', () => {
    render(
      <CraneApprovalRow
        crane={makeCrane()}
        organizationName="TELSE"
        onApprove={() => {}}
        onReject={() => {}}
      />,
    )
    expect(screen.getByText('КБ-403', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('INV-001')).toBeInTheDocument()
    expect(screen.getByText('Башенный')).toBeInTheDocument()
    expect(screen.getByText('8 т')).toBeInTheDocument()
    expect(screen.getByText('TELSE')).toBeInTheDocument()
  })

  it('omits inventoryNumber when null', () => {
    render(
      <CraneApprovalRow
        crane={makeCrane({ inventoryNumber: null })}
        onApprove={() => {}}
        onReject={() => {}}
      />,
    )
    expect(screen.queryByText('INV-001')).toBeNull()
  })

  it('fires approve and reject callbacks', async () => {
    const onApprove = vi.fn()
    const onReject = vi.fn()
    render(<CraneApprovalRow crane={makeCrane()} onApprove={onApprove} onReject={onReject} />)
    await userEvent.click(screen.getByRole('button', { name: 'Одобрить' }))
    await userEvent.click(screen.getByRole('button', { name: 'Отклонить' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('disables buttons when pending', () => {
    render(
      <CraneApprovalRow crane={makeCrane()} onApprove={() => {}} onReject={() => {}} isPending />,
    )
    expect(screen.getByRole('button', { name: 'Одобрить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeDisabled()
  })
})
