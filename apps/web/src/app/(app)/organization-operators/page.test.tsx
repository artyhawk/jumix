import type { OrganizationOperator } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrganizationOperatorsPage from './page'

vi.mock('@/lib/api/organization-operators', () => ({
  listOrganizationOperators: vi.fn(),
  getOrganizationOperator: vi.fn(),
  approveOrganizationOperator: vi.fn(),
  rejectOrganizationOperator: vi.fn(),
}))
vi.mock('@/lib/api/organizations', () => ({
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  createOrganization: vi.fn(),
  suspendOrganization: vi.fn(),
  activateOrganization: vi.fn(),
}))
vi.mock('@/lib/api/crane-profiles', () => ({
  listCraneProfiles: vi.fn(),
  getCraneProfile: vi.fn(),
  approveCraneProfile: vi.fn(),
  rejectCraneProfile: vi.fn(),
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

const push = vi.fn()
const replace = vi.fn()
const searchParams = { get: vi.fn<(k: string) => string | null>(), toString: vi.fn(() => '') }
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/organization-operators',
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Admin' },
    hydrated: true,
    isAuthenticated: true,
    logout: () => {},
  }),
}))

import { listOrganizationOperators } from '@/lib/api/organization-operators'
import { listOrganizations } from '@/lib/api/organizations'
const list = vi.mocked(listOrganizationOperators)
const listOrgs = vi.mocked(listOrganizations)

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
    approvalStatus: 'approved',
    rejectionReason: null,
    phone: '+77010000001',
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <OrganizationOperatorsPage />
    </Wrapper>,
  )
}

beforeEach(() => {
  list.mockReset()
  listOrgs.mockReset()
  push.mockReset()
  replace.mockReset()
  searchParams.get.mockReset()
  searchParams.get.mockReturnValue(null)
  searchParams.toString.mockReturnValue('')
  list.mockResolvedValue({ items: [makeHire()], nextCursor: null })
  listOrgs.mockResolvedValue({
    items: [
      {
        id: 'org-1',
        name: 'ТОО «Альфа»',
        bin: '123456789013',
        status: 'active',
        contactName: null,
        contactPhone: null,
        contactEmail: null,
        createdAt: '2026-04-20T10:00:00Z',
        updatedAt: '2026-04-20T10:00:00Z',
      },
    ],
    nextCursor: null,
  })
})

describe('OrganizationOperatorsPage', () => {
  it('renders heading and rows with resolved organization name', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Назначения' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText('Иванов Иван Петрович').length).toBeGreaterThan(0)
    })
    await waitFor(() => {
      expect(screen.getAllByText('ТОО «Альфа»').length).toBeGreaterThan(0)
    })
  })

  it('passes organizationId filter to listOrganizationOperators', async () => {
    searchParams.get.mockImplementation((k: string) => (k === 'org' ? 'org-1' : null))
    renderPage()
    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', limit: 20 }),
      )
    })
  })

  it('clicking a row calls router.replace with ?open=<id>', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getAllByText('Иванов Иван Петрович').length).toBeGreaterThan(0),
    )
    const row = screen.getAllByText('Иванов Иван Петрович')[0]!
    await userEvent.click(row)
    expect(replace).toHaveBeenCalledWith('/organization-operators?open=h-1', { scroll: false })
  })
})
