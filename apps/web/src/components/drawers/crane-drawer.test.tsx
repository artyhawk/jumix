import type { Crane } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/cranes', () => ({
  listCranes: vi.fn(),
  getCrane: vi.fn(),
  approveCrane: vi.fn(),
  rejectCrane: vi.fn(),
}))
vi.mock('@/lib/api/crane-profiles', () => ({
  getCraneProfile: vi.fn(),
  approveCraneProfile: vi.fn(),
  rejectCraneProfile: vi.fn(),
  listCraneProfiles: vi.fn(),
}))
vi.mock('@/lib/api/organization-operators', () => ({
  listOrganizationOperators: vi.fn(),
  getOrganizationOperator: vi.fn(),
  approveOrganizationOperator: vi.fn(),
  rejectOrganizationOperator: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import * as cranesApi from '@/lib/api/cranes'
import { CraneDrawer } from './crane-drawer'

const get = vi.mocked(cranesApi.getCrane)
const approve = vi.mocked(cranesApi.approveCrane)

function makeCrane(overrides: Partial<Crane> = {}): Crane {
  return {
    id: 'c-1',
    organizationId: 'o-1',
    siteId: null,
    type: 'tower',
    model: 'Liebherr 200EC-B',
    inventoryNumber: 'INV-001',
    capacityTon: 8,
    boomLengthM: 50,
    yearManufactured: 2020,
    status: 'active',
    approvalStatus: 'pending',
    rejectionReason: null,
    notes: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  get.mockReset()
  approve.mockReset()
})

describe('CraneDrawer', () => {
  it('does not render when id is null', () => {
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id={null} onOpenChange={() => {}} />, { wrapper: Wrapper })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders crane details when id provided', async () => {
    get.mockResolvedValueOnce(makeCrane())
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getAllByText('Liebherr 200EC-B').length).toBeGreaterThan(0))
    expect(screen.getByText('Башенный')).toBeInTheDocument()
    expect(screen.getByText('INV-001')).toBeInTheDocument()
  })

  it('shows Approve/Reject only for pending', async () => {
    get.mockResolvedValueOnce(makeCrane({ approvalStatus: 'approved' }))
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getAllByText('Liebherr 200EC-B').length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: 'Одобрить' })).not.toBeInTheDocument()
  })

  it('approve button fires mutation', async () => {
    get.mockResolvedValue(makeCrane())
    approve.mockResolvedValueOnce(makeCrane({ approvalStatus: 'approved' }))
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    const btn = await screen.findByRole('button', { name: 'Одобрить' })
    await userEvent.click(btn)
    await waitFor(() => expect(approve).toHaveBeenCalledWith('c-1'))
  })

  it('shows rejection reason for rejected cranes', async () => {
    get.mockResolvedValueOnce(
      makeCrane({ approvalStatus: 'rejected', rejectionReason: 'не соответствует требованиям' }),
    )
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await waitFor(() =>
      expect(screen.getByText('не соответствует требованиям')).toBeInTheDocument(),
    )
  })
})
