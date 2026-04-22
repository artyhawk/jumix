import type { CraneProfile } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/lib/api/cranes', () => ({
  listCranes: vi.fn(),
  getCrane: vi.fn(),
  approveCrane: vi.fn(),
  rejectCrane: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import * as craneProfilesApi from '@/lib/api/crane-profiles'
import { CraneProfileDrawer } from './crane-profile-drawer'

const get = vi.mocked(craneProfilesApi.getCraneProfile)
const approve = vi.mocked(craneProfilesApi.approveCraneProfile)

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
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  get.mockReset()
  approve.mockReset()
})

describe('CraneProfileDrawer', () => {
  it('does not render when id is null', () => {
    const { Wrapper } = createQueryWrapper()
    render(<CraneProfileDrawer id={null} onOpenChange={() => {}} />, { wrapper: Wrapper })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders profile details when id provided', async () => {
    get.mockResolvedValueOnce(makeProfile())
    const { Wrapper } = createQueryWrapper()
    render(<CraneProfileDrawer id="p-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByText('Иванов Иван Петрович')).toBeInTheDocument())
    expect(screen.getByText('900101300001')).toBeInTheDocument()
  })

  it('shows Approve/Reject only for pending', async () => {
    get.mockResolvedValueOnce(makeProfile({ approvalStatus: 'approved' }))
    const { Wrapper } = createQueryWrapper()
    render(<CraneProfileDrawer id="p-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByText('Иванов Иван Петрович')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Одобрить' })).not.toBeInTheDocument()
  })

  it('approve button fires mutation', async () => {
    get.mockResolvedValue(makeProfile())
    approve.mockResolvedValueOnce(makeProfile({ approvalStatus: 'approved' }))
    const { Wrapper } = createQueryWrapper()
    render(<CraneProfileDrawer id="p-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    const btn = await screen.findByRole('button', { name: 'Одобрить' })
    await userEvent.click(btn)
    await waitFor(() => expect(approve).toHaveBeenCalledWith('p-1'))
  })

  it('shows rejection reason for rejected profiles', async () => {
    get.mockResolvedValueOnce(
      makeProfile({ approvalStatus: 'rejected', rejectionReason: 'некорректные данные' }),
    )
    const { Wrapper } = createQueryWrapper()
    render(<CraneProfileDrawer id="p-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByText('некорректные данные')).toBeInTheDocument())
  })
})
