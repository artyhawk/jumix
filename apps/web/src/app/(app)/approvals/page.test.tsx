import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApprovalsPage from './page'

vi.mock('@/lib/api/dashboard', () => ({
  getDashboardStats: vi.fn(),
}))
vi.mock('@/lib/api/crane-profiles', () => ({
  listCraneProfiles: vi.fn(),
  getCraneProfile: vi.fn(),
  approveCraneProfile: vi.fn(),
  rejectCraneProfile: vi.fn(),
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

const push = vi.fn()
const replace = vi.fn()
const searchParams = { get: vi.fn() }
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/approvals',
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Admin' },
    hydrated: true,
    isAuthenticated: true,
    logout: () => {},
  }),
}))

import { listCraneProfiles } from '@/lib/api/crane-profiles'
import { listCranes } from '@/lib/api/cranes'
import { getDashboardStats } from '@/lib/api/dashboard'
import { listOrganizationOperators } from '@/lib/api/organization-operators'

const stats = vi.mocked(getDashboardStats)
const listCp = vi.mocked(listCraneProfiles)
const listHires = vi.mocked(listOrganizationOperators)
const listCraneFn = vi.mocked(listCranes)

function renderPage() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <ApprovalsPage />
    </Wrapper>,
  )
}

beforeEach(() => {
  stats.mockReset()
  listCp.mockReset()
  listHires.mockReset()
  listCraneFn.mockReset()
  push.mockReset()
  replace.mockReset()
  searchParams.get.mockReset()
  stats.mockResolvedValue({
    pending: { craneProfiles: 3, organizationOperators: 2, cranes: 1 },
    active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
    thisWeek: { newRegistrations: 0 },
  })
  listCp.mockResolvedValue({ items: [], nextCursor: null })
  listHires.mockResolvedValue({ items: [], nextCursor: null })
  listCraneFn.mockResolvedValue({ items: [], nextCursor: null })
})

describe('ApprovalsPage', () => {
  it('renders page title and tabs with badges', async () => {
    searchParams.get.mockReturnValue(null)
    renderPage()
    expect(screen.getByRole('heading', { name: 'Заявки на рассмотрение' })).toBeInTheDocument()
    await waitFor(() => {
      // badges resolved from dashboard stats
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
    })
  })

  it('defaults to crane-profiles tab → calls listCraneProfiles', async () => {
    searchParams.get.mockReturnValue(null)
    renderPage()
    await waitFor(() => expect(listCp).toHaveBeenCalled())
  })

  it('when ?tab=hires in URL → renders HiresQueue', async () => {
    searchParams.get.mockReturnValue('hires')
    renderPage()
    await waitFor(() => expect(listHires).toHaveBeenCalled())
  })

  it('when ?tab=cranes → renders CranesQueue', async () => {
    searchParams.get.mockReturnValue('cranes')
    renderPage()
    await waitFor(() => expect(listCraneFn).toHaveBeenCalled())
  })

  it('invalid ?tab=... → router.replace to default', async () => {
    searchParams.get.mockReturnValue('bogus')
    renderPage()
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/approvals?tab=crane-profiles'))
  })

  it('clicking a different tab calls router.push with new query', async () => {
    searchParams.get.mockReturnValue('crane-profiles')
    renderPage()
    const hiresTab = await screen.findByRole('tab', { name: /Наймы/ })
    await userEvent.click(hiresTab)
    expect(push).toHaveBeenCalledWith('/approvals?tab=hires')
  })

  it('shows empty-queue when list is empty', async () => {
    searchParams.get.mockReturnValue('crane-profiles')
    renderPage()
    await waitFor(() => expect(screen.getByText('Нет заявок крановых')).toBeInTheDocument())
  })
})
