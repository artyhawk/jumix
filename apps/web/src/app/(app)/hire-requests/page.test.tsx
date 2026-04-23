import type { OrganizationOperator } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HireRequestsPage from './page'

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
  listCraneProfiles: vi.fn(async () => ({ items: [], nextCursor: null })),
  getCraneProfile: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const push = vi.fn()
const replace = vi.fn()
const searchParams = { get: vi.fn<(k: string) => string | null>(), toString: vi.fn(() => '') }
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/hire-requests',
}))

const authUser: {
  user: {
    id: string
    role: 'superadmin' | 'owner' | 'operator'
    organizationId: string | null
    name: string
  }
} = {
  user: { id: 'u-1', role: 'owner', organizationId: 'org-1', name: 'Owner' },
}
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: authUser.user,
    hydrated: true,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}))

import { listOrganizationOperators } from '@/lib/api/organization-operators'
const list = vi.mocked(listOrganizationOperators)

function makeHire(id = 'h-1'): OrganizationOperator {
  return {
    id,
    craneProfileId: `cp-${id}`,
    organizationId: 'org-1',
    craneProfile: {
      id: `cp-${id}`,
      firstName: 'Иван',
      lastName: 'Иванов',
      patronymic: null,
      iin: '900101300001',
      avatarUrl: null,
      licenseStatus: 'valid',
    },
    hiredAt: null,
    terminatedAt: null,
    status: 'active',
    availability: null,
    approvalStatus: 'pending',
    rejectionReason: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
  }
}

function renderPage() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <HireRequestsPage />
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
  authUser.user = { id: 'u-1', role: 'owner', organizationId: 'org-1', name: 'Owner' }
  list.mockResolvedValue({ items: [], nextCursor: null })
})

describe('HireRequestsPage', () => {
  it('renders heading for owner', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Заявки на найм' })).toBeInTheDocument()
  })

  it('non-owner is redirected to /', () => {
    authUser.user = { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Super' }
    renderPage()
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('queries hires with approvalStatus=pending', async () => {
    renderPage()
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ approvalStatus: 'pending', limit: 50 }),
      ),
    )
  })

  it('renders empty state + CTA when no pending hires', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Нет запросов найма').length).toBe(1))
    const ctaButtons = screen.getAllByRole('button', { name: /Нанять крановщика/ })
    expect(ctaButtons.length).toBeGreaterThan(0)
  })

  it('renders pending hire rows', async () => {
    list.mockResolvedValue({ items: [makeHire()], nextCursor: null })
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Иванов Иван').length).toBeGreaterThan(0))
    expect(screen.getByText('900101300001')).toBeInTheDocument()
  })

  it('clicking row opens drawer via ?open', async () => {
    list.mockResolvedValue({ items: [makeHire('h-42')], nextCursor: null })
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Иванов Иван').length).toBeGreaterThan(0))
    const row = screen.getAllByText('Иванов Иван')[0]
    await userEvent.click(row!)
    expect(replace).toHaveBeenCalledWith('/hire-requests?open=h-42', { scroll: false })
  })

  it('Нанять крановщика button opens ?create=true', async () => {
    renderPage()
    const btns = screen.getAllByRole('button', { name: /Нанять крановщика/ })
    await userEvent.click(btns[0]!)
    expect(replace).toHaveBeenCalledWith('/hire-requests?create=true', { scroll: false })
  })

  it('subtitle reflects pending count', async () => {
    list.mockResolvedValue({ items: [makeHire('a'), makeHire('b')], nextCursor: null })
    renderPage()
    await waitFor(() => expect(screen.getByText('2 на рассмотрении')).toBeInTheDocument())
  })
})
