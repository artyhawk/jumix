import type { OrganizationOperator } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MyOperatorsPage from './page'

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
  usePathname: () => '/my-operators',
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

function makeHire(
  id = 'h-1',
  status: 'active' | 'blocked' | 'terminated' = 'active',
): OrganizationOperator {
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
    hiredAt: '2026-04-20T10:00:00Z',
    terminatedAt: null,
    status,
    availability: 'free',
    approvalStatus: 'approved',
    rejectionReason: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
  }
}

function renderPage() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <MyOperatorsPage />
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
  list.mockResolvedValue({ items: [makeHire()], nextCursor: null })
})

describe('MyOperatorsPage', () => {
  it('renders heading', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Мои операторы' })).toBeInTheDocument()
  })

  it('non-owner is redirected', () => {
    authUser.user = { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Super' }
    renderPage()
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('queries hires scoped to approved only', async () => {
    renderPage()
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ approvalStatus: 'approved', limit: 20 }),
      ),
    )
  })

  it('renders approved operator rows', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Иванов Иван').length).toBeGreaterThan(0))
  })

  it('status filter updates URL-state', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Иванов Иван').length).toBeGreaterThan(0))
    await userEvent.click(screen.getByLabelText('Фильтр: Статус'))
    const blockedOption = await screen.findByText('Заблокированные')
    await userEvent.click(blockedOption)
    expect(replace).toHaveBeenCalledWith('/my-operators?status=blocked', { scroll: false })
  })

  it('clicking row opens drawer', async () => {
    list.mockResolvedValue({ items: [makeHire('h-42')], nextCursor: null })
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Иванов Иван').length).toBeGreaterThan(0))
    const row = screen.getAllByText('Иванов Иван')[0]!
    await userEvent.click(row)
    expect(replace).toHaveBeenCalledWith('/my-operators?open=h-42', { scroll: false })
  })

  it('empty state links to /hire-requests when no filters', async () => {
    list.mockResolvedValue({ items: [], nextCursor: null })
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('У вас пока нет нанятых крановых')).toBeInTheDocument(),
    )
    const cta = screen.getByRole('button', { name: 'Нанять кранового' })
    await userEvent.click(cta)
    expect(push).toHaveBeenCalledWith('/hire-requests?create=true')
  })
})
