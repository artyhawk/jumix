import type { Organization } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/organizations', () => ({
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  suspendOrganization: vi.fn(),
  activateOrganization: vi.fn(),
  archiveOrganization: vi.fn(),
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
  } | null
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

import * as orgsApi from '@/lib/api/organizations'
import { OrganizationDrawer } from './organization-drawer'

const get = vi.mocked(orgsApi.getOrganization)
const suspend = vi.mocked(orgsApi.suspendOrganization)
const activate = vi.mocked(orgsApi.activateOrganization)
const archive = vi.mocked(orgsApi.archiveOrganization)
const update = vi.mocked(orgsApi.updateOrganization)

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'o-1',
    name: 'ТОО «Telse»',
    bin: '123456789012',
    status: 'active',
    contactName: 'Асель Каримова',
    contactPhone: '+77010000001',
    contactEmail: 'info@telse.kz',
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  get.mockReset()
  suspend.mockReset()
  activate.mockReset()
  archive.mockReset()
  update.mockReset()
  mockUser.value = { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Super' }
})

describe('OrganizationDrawer', () => {
  it('does not render when id is null', () => {
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationDrawer id={null} onOpenChange={() => {}} />, { wrapper: Wrapper })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders organization details when id provided', async () => {
    get.mockResolvedValueOnce(makeOrg())
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationDrawer id="o-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getAllByText('ТОО «Telse»').length).toBeGreaterThan(0))
    expect(screen.getByText('123456789012')).toBeInTheDocument()
    expect(screen.getByText('Активна')).toBeInTheDocument()
  })

  it('shows Suspend for active organization', async () => {
    get.mockResolvedValue(makeOrg())
    suspend.mockResolvedValueOnce(makeOrg({ status: 'suspended' }))
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationDrawer id="o-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    const btn = await screen.findByRole('button', { name: 'Приостановить' })
    await userEvent.click(btn)
    await waitFor(() => expect(suspend).toHaveBeenCalledWith('o-1'))
  })

  it('shows Activate for suspended organization', async () => {
    get.mockResolvedValue(makeOrg({ status: 'suspended' }))
    activate.mockResolvedValueOnce(makeOrg({ status: 'active' }))
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationDrawer id="o-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    const btn = await screen.findByRole('button', { name: 'Активировать' })
    await userEvent.click(btn)
    await waitFor(() => expect(activate).toHaveBeenCalledWith('o-1'))
  })

  it('hides all action buttons for archived organizations', async () => {
    get.mockResolvedValueOnce(makeOrg({ status: 'archived' }))
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationDrawer id="o-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getAllByText('ТОО «Telse»').length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: 'Приостановить' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Активировать' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Архивировать/ })).not.toBeInTheDocument()
  })

  it('hides footer actions for non-superadmin', async () => {
    mockUser.value = { id: 'u-2', role: 'owner', organizationId: 'o-1', name: 'Owner' }
    get.mockResolvedValue(makeOrg())
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationDrawer id="o-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getAllByText('ТОО «Telse»').length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: 'Приостановить' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Редактировать/ })).not.toBeInTheDocument()
  })

  it('Архивировать shows inline confirmation, не вызывает mutation сразу', async () => {
    get.mockResolvedValue(makeOrg())
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationDrawer id="o-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await userEvent.click(await screen.findByRole('button', { name: /Архивировать/ }))
    expect(archive).not.toHaveBeenCalled()
    expect(screen.getByText(/Архивация — терминальное состояние/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Да, архивировать/ })).toBeInTheDocument()
  })

  it('Редактировать открывает EditOrganizationDialog', async () => {
    get.mockResolvedValue(makeOrg())
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationDrawer id="o-1" onOpenChange={() => {}} />, { wrapper: Wrapper })
    await userEvent.click(await screen.findByRole('button', { name: /Редактировать/ }))
    expect(screen.getByText('Редактировать организацию')).toBeInTheDocument()
  })
})
