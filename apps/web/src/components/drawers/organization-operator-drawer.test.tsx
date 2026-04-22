import type { OrganizationOperator } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/organization-operators', () => ({
  listOrganizationOperators: vi.fn(),
  getOrganizationOperator: vi.fn(),
  approveOrganizationOperator: vi.fn(),
  rejectOrganizationOperator: vi.fn(),
}))
vi.mock('@/lib/api/crane-profiles', () => ({
  getCraneProfile: vi.fn(),
  approveCraneProfile: vi.fn(),
  rejectCraneProfile: vi.fn(),
  listCraneProfiles: vi.fn(),
}))
vi.mock('@/lib/api/cranes', () => ({
  listCranes: vi.fn(),
  getCrane: vi.fn(),
  approveCrane: vi.fn(),
  rejectCrane: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import * as hiresApi from '@/lib/api/organization-operators'
import { OrganizationOperatorDrawer } from './organization-operator-drawer'

const get = vi.mocked(hiresApi.getOrganizationOperator)
const approve = vi.mocked(hiresApi.approveOrganizationOperator)

function makeHire(overrides: Partial<OrganizationOperator> = {}): OrganizationOperator {
  return {
    id: 'h-1',
    craneProfileId: 'cp-1',
    organizationId: 'org-1',
    craneProfile: {
      id: 'cp-1',
      firstName: 'Иван',
      lastName: 'Иванов',
      patronymic: 'Петрович',
      iin: '900101300001',
      avatarUrl: null,
      licenseStatus: 'valid',
    },
    hiredAt: '2026-04-20T10:00:00Z',
    terminatedAt: null,
    status: 'active',
    availability: 'free',
    approvalStatus: 'pending',
    rejectionReason: null,
    phone: '+77010000001',
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  get.mockReset()
  approve.mockReset()
})

describe('OrganizationOperatorDrawer', () => {
  it('does not render when id is null', () => {
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationOperatorDrawer id={null} onOpenChange={() => {}} />, { wrapper: Wrapper })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders hire details with organization name', async () => {
    get.mockResolvedValueOnce(makeHire())
    const { Wrapper } = createQueryWrapper()
    render(
      <OrganizationOperatorDrawer
        id="h-1"
        onOpenChange={() => {}}
        organizationName="ТОО «Альфа»"
      />,
      { wrapper: Wrapper },
    )
    await waitFor(() =>
      expect(screen.getAllByText('Иванов Иван Петрович').length).toBeGreaterThan(0),
    )
    expect(screen.getByText('ТОО «Альфа»')).toBeInTheDocument()
    expect(screen.getByText('900101300001')).toBeInTheDocument()
  })

  it('hides Approve/Reject for approved hires', async () => {
    get.mockResolvedValueOnce(makeHire({ approvalStatus: 'approved' }))
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationOperatorDrawer id="h-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await waitFor(() =>
      expect(screen.getAllByText('Иванов Иван Петрович').length).toBeGreaterThan(0),
    )
    expect(screen.queryByRole('button', { name: 'Одобрить' })).not.toBeInTheDocument()
  })

  it('approve button fires mutation', async () => {
    get.mockResolvedValue(makeHire())
    approve.mockResolvedValueOnce(makeHire({ approvalStatus: 'approved' }))
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationOperatorDrawer id="h-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    const btn = await screen.findByRole('button', { name: 'Одобрить' })
    await userEvent.click(btn)
    await waitFor(() => expect(approve).toHaveBeenCalledWith('h-1'))
  })

  it('invokes onOpenCraneProfile when profile button clicked', async () => {
    get.mockResolvedValueOnce(makeHire({ approvalStatus: 'approved' }))
    const onOpenCraneProfile = vi.fn()
    const { Wrapper } = createQueryWrapper()
    render(
      <OrganizationOperatorDrawer
        id="h-1"
        onOpenChange={() => {}}
        onOpenCraneProfile={onOpenCraneProfile}
      />,
      { wrapper: Wrapper },
    )
    const btn = await screen.findByRole('button', { name: /Открыть профиль крановщика/ })
    await userEvent.click(btn)
    expect(onOpenCraneProfile).toHaveBeenCalledWith('cp-1')
  })

  it('shows rejection reason for rejected hires', async () => {
    get.mockResolvedValueOnce(
      makeHire({ approvalStatus: 'rejected', rejectionReason: 'дубликат назначения' }),
    )
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationOperatorDrawer id="h-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByText('дубликат назначения')).toBeInTheDocument())
  })
})
