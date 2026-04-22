import type { Organization } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrganizationsPage from './page'

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

const push = vi.fn()
const replace = vi.fn()
const searchParams = { get: vi.fn<(k: string) => string | null>(), toString: vi.fn(() => '') }
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/organizations',
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Admin' },
    hydrated: true,
    isAuthenticated: true,
    logout: () => {},
  }),
}))

import { listOrganizations } from '@/lib/api/organizations'
const list = vi.mocked(listOrganizations)

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'o-1',
    name: 'ТОО «Альфа»',
    bin: '123456789013',
    status: 'active',
    contactName: 'Асель',
    contactPhone: '+77010001122',
    contactEmail: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <OrganizationsPage />
    </Wrapper>,
  )
}

beforeEach(() => {
  list.mockReset()
  push.mockReset()
  replace.mockReset()
  searchParams.get.mockReset()
  searchParams.get.mockReturnValue(null)
  searchParams.toString.mockReturnValue('')
  list.mockResolvedValue({ items: [makeOrg()], nextCursor: null })
})

describe('OrganizationsPage', () => {
  it('renders heading and list', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Организации' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText('ТОО «Альфа»').length).toBeGreaterThan(0)
    })
  })

  it('clicking "Новая организация" updates URL with ?create=true', async () => {
    renderPage()
    const btn = await screen.findByRole('button', { name: /Новая организация/ })
    await userEvent.click(btn)
    expect(replace).toHaveBeenCalledWith('/organizations?create=true', { scroll: false })
  })

  it('?create=true in URL opens CreateOrganizationDialog', async () => {
    searchParams.get.mockImplementation((k: string) => (k === 'create' ? 'true' : null))
    renderPage()
    await waitFor(() => expect(screen.getByText('Владелец')).toBeInTheDocument())
  })

  it('clicking a row calls router.replace with ?open=<id>', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('ТОО «Альфа»').length).toBeGreaterThan(0))
    const row = screen.getAllByText('ТОО «Альфа»')[0]!
    await userEvent.click(row)
    expect(replace).toHaveBeenCalledWith('/organizations?open=o-1', { scroll: false })
  })
})
