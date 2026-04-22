import type { Organization } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/organizations', () => ({
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  createOrganization: vi.fn(),
  suspendOrganization: vi.fn(),
  activateOrganization: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import * as orgsApi from '@/lib/api/organizations'
import { OrganizationDrawer } from './organization-drawer'

const get = vi.mocked(orgsApi.getOrganization)
const suspend = vi.mocked(orgsApi.suspendOrganization)
const activate = vi.mocked(orgsApi.activateOrganization)

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
  })
})
