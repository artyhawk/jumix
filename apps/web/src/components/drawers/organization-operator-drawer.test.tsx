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
  createHireRequest: vi.fn(),
  blockOrganizationOperator: vi.fn(),
  activateOrganizationOperator: vi.fn(),
  terminateOrganizationOperator: vi.fn(),
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

const mockUser: {
  value: {
    id: string
    role: 'superadmin' | 'owner' | 'operator'
    organizationId: string | null
    name: string
  }
} = {
  value: { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Super' },
}
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: mockUser.value,
    hydrated: true,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}))

function asSuperadmin() {
  mockUser.value = { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Super' }
}
function asOwner(orgId = 'org-1') {
  mockUser.value = { id: 'u-2', role: 'owner', organizationId: orgId, name: 'Owner' }
}

import * as hiresApi from '@/lib/api/organization-operators'
import { OrganizationOperatorDrawer } from './organization-operator-drawer'

const get = vi.mocked(hiresApi.getOrganizationOperator)
const approve = vi.mocked(hiresApi.approveOrganizationOperator)
const block = vi.mocked(hiresApi.blockOrganizationOperator)
const activate = vi.mocked(hiresApi.activateOrganizationOperator)
const terminate = vi.mocked(hiresApi.terminateOrganizationOperator)

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
  block.mockReset()
  activate.mockReset()
  terminate.mockReset()
  asSuperadmin()
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

  describe('owner footer actions', () => {
    it('active hire shows Приостановить + Уволить for owner', async () => {
      asOwner('org-1')
      get.mockResolvedValueOnce(makeHire({ approvalStatus: 'approved', status: 'active' }))
      const { Wrapper } = createQueryWrapper()
      render(<OrganizationOperatorDrawer id="h-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Приостановить' })).toBeInTheDocument(),
      )
      expect(screen.getByRole('button', { name: 'Уволить' })).toBeInTheDocument()
    })

    it('blocked hire shows Разблокировать + Уволить', async () => {
      asOwner('org-1')
      get.mockResolvedValueOnce(makeHire({ approvalStatus: 'approved', status: 'blocked' }))
      const { Wrapper } = createQueryWrapper()
      render(<OrganizationOperatorDrawer id="h-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Разблокировать' })).toBeInTheDocument(),
      )
      expect(screen.getByRole('button', { name: 'Уволить' })).toBeInTheDocument()
    })

    it('terminated hire shows no footer actions (terminal)', async () => {
      asOwner('org-1')
      get.mockResolvedValueOnce(
        makeHire({
          approvalStatus: 'approved',
          status: 'terminated',
          terminatedAt: '2026-04-20',
        }),
      )
      const { Wrapper } = createQueryWrapper()
      render(<OrganizationOperatorDrawer id="h-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
      await waitFor(() => expect(screen.getByText(/Сотрудник уволен/)).toBeInTheDocument())
      expect(screen.queryByRole('button', { name: 'Приостановить' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Уволить' })).not.toBeInTheDocument()
    })

    it('Приостановить reveals optional reason input, submit calls block mutation', async () => {
      asOwner('org-1')
      get.mockResolvedValueOnce(makeHire({ approvalStatus: 'approved', status: 'active' }))
      block.mockResolvedValueOnce(makeHire({ approvalStatus: 'approved', status: 'blocked' }))
      const { Wrapper } = createQueryWrapper()
      render(<OrganizationOperatorDrawer id="h-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
      await userEvent.click(await screen.findByRole('button', { name: 'Приостановить' }))
      const textarea = screen.getByLabelText('Причина (необязательно)')
      await userEvent.type(textarea, 'нарушение')
      await userEvent.click(screen.getByRole('button', { name: 'Приостановить' }))
      await waitFor(() => expect(block).toHaveBeenCalledWith('h-1', 'нарушение'))
    })

    it('Уволить shows inline confirmation (not direct mutation)', async () => {
      asOwner('org-1')
      get.mockResolvedValue(makeHire({ approvalStatus: 'approved', status: 'active' }))
      const { Wrapper } = createQueryWrapper()
      render(<OrganizationOperatorDrawer id="h-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
      await userEvent.click(await screen.findByRole('button', { name: 'Уволить' }))
      // Confirmation surfaces; mutation НЕ вызвана до явного подтверждения.
      expect(terminate).not.toHaveBeenCalled()
      expect(screen.getByText(/Это действие нельзя отменить/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Да, уволить/ })).toBeInTheDocument()
    })

    it('owner with different org does not see owner footer (cross-tenant)', async () => {
      asOwner('org-2')
      get.mockResolvedValueOnce(makeHire({ approvalStatus: 'approved', status: 'active' }))
      const { Wrapper } = createQueryWrapper()
      render(<OrganizationOperatorDrawer id="h-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
      await waitFor(() =>
        expect(screen.getAllByText('Иванов Иван Петрович').length).toBeGreaterThan(0),
      )
      expect(screen.queryByRole('button', { name: 'Приостановить' })).not.toBeInTheDocument()
    })
  })
})
