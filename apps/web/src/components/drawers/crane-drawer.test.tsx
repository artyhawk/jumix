import type { Crane, UserRole } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/cranes', () => ({
  listCranes: vi.fn(),
  getCrane: vi.fn(),
  approveCrane: vi.fn(),
  rejectCrane: vi.fn(),
  assignCraneToSite: vi.fn(),
  unassignCraneFromSite: vi.fn(),
  activateCrane: vi.fn(),
  setCraneMaintenance: vi.fn(),
  retireCrane: vi.fn(),
  resubmitCrane: vi.fn(),
}))
vi.mock('@/lib/api/sites', () => ({
  listSites: vi.fn(async () => ({ items: [], nextCursor: null })),
  getSite: vi.fn(),
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

const mockUser = {
  value: {
    id: 'u-1',
    role: 'superadmin' as UserRole,
    organizationId: null as string | null,
    name: 'A',
  },
}
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: mockUser.value,
    hydrated: true,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}))

import * as cranesApi from '@/lib/api/cranes'
import * as sitesApi from '@/lib/api/sites'
import { CraneDrawer } from './crane-drawer'

const get = vi.mocked(cranesApi.getCrane)
const approve = vi.mocked(cranesApi.approveCrane)
const assign = vi.mocked(cranesApi.assignCraneToSite)
const unassign = vi.mocked(cranesApi.unassignCraneFromSite)
const activate = vi.mocked(cranesApi.activateCrane)
const maintenance = vi.mocked(cranesApi.setCraneMaintenance)
const retire = vi.mocked(cranesApi.retireCrane)
const resubmit = vi.mocked(cranesApi.resubmitCrane)
const listSites = vi.mocked(sitesApi.listSites)

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

function asOwner(orgId = 'o-1') {
  mockUser.value = { id: 'u-1', role: 'owner', organizationId: orgId, name: 'Owner' }
}
function asSuperadmin() {
  mockUser.value = { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Admin' }
}

beforeEach(() => {
  get.mockReset()
  approve.mockReset()
  assign.mockReset()
  unassign.mockReset()
  activate.mockReset()
  maintenance.mockReset()
  retire.mockReset()
  resubmit.mockReset()
  listSites.mockReset()
  listSites.mockResolvedValue({ items: [], nextCursor: null })
  asSuperadmin()
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

  it('shows Approve/Reject only for pending (superadmin)', async () => {
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

  it('owner: hides Approve/Reject on pending', async () => {
    asOwner('o-1')
    get.mockResolvedValueOnce(makeCrane({ approvalStatus: 'pending' }))
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await screen.findByText('Башенный')
    expect(screen.queryByRole('button', { name: 'Одобрить' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отклонить' })).not.toBeInTheDocument()
  })

  it('owner rejected: shows Resubmit button', async () => {
    asOwner('o-1')
    get.mockResolvedValueOnce(makeCrane({ approvalStatus: 'rejected', rejectionReason: 'r' }))
    resubmit.mockResolvedValueOnce(makeCrane({ approvalStatus: 'pending' }))
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })

    const btn = await screen.findByRole('button', { name: /Отправить повторно/ })
    await userEvent.click(btn)
    await waitFor(() => expect(resubmit).toHaveBeenCalledWith('c-1'))
  })

  it('owner approved+active: shows На ремонт + Списать', async () => {
    asOwner('o-1')
    get.mockResolvedValueOnce(makeCrane({ approvalStatus: 'approved', status: 'active' }))
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })

    await screen.findByRole('button', { name: /На ремонт/ })
    expect(screen.getByRole('button', { name: /Списать/ })).toBeInTheDocument()
  })

  it('owner approved+active: На ремонт calls setMaintenance', async () => {
    asOwner('o-1')
    get.mockResolvedValue(makeCrane({ approvalStatus: 'approved', status: 'active' }))
    maintenance.mockResolvedValueOnce(makeCrane({ status: 'maintenance' }))
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })

    const btn = await screen.findByRole('button', { name: /На ремонт/ })
    await userEvent.click(btn)
    await waitFor(() => expect(maintenance).toHaveBeenCalledWith('c-1'))
  })

  it('owner retire flows through inline confirmation', async () => {
    asOwner('o-1')
    get.mockResolvedValue(makeCrane({ approvalStatus: 'approved', status: 'active' }))
    retire.mockResolvedValueOnce(makeCrane({ status: 'retired' }))
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })

    const firstRetire = await screen.findByRole('button', { name: /Списать/ })
    await userEvent.click(firstRetire)
    const confirm = await screen.findByRole('button', { name: 'Списать' })
    await userEvent.click(confirm)
    await waitFor(() => expect(retire).toHaveBeenCalledWith('c-1'))
  })

  it('owner approved+maintenance: shows В работу + Списать', async () => {
    asOwner('o-1')
    get.mockResolvedValueOnce(makeCrane({ approvalStatus: 'approved', status: 'maintenance' }))
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })

    await screen.findByRole('button', { name: /В работу/ })
    expect(screen.getByRole('button', { name: /Списать/ })).toBeInTheDocument()
  })

  it('owner approved+retired: only Восстановить', async () => {
    asOwner('o-1')
    get.mockResolvedValueOnce(makeCrane({ approvalStatus: 'approved', status: 'retired' }))
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })

    await screen.findByRole('button', { name: /Восстановить/ })
    expect(screen.queryByRole('button', { name: /Списать/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /На ремонт/ })).toBeNull()
  })

  it('owner from other org: no footer actions', async () => {
    asOwner('o-other')
    get.mockResolvedValueOnce(
      makeCrane({ organizationId: 'o-1', approvalStatus: 'approved', status: 'active' }),
    )
    const { Wrapper } = createQueryWrapper()
    render(<CraneDrawer id="c-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await screen.findByText('Башенный')
    expect(screen.queryByRole('button', { name: /На ремонт/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Списать/ })).not.toBeInTheDocument()
  })
})
