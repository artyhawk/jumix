import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from './page'

vi.mock('@/lib/api/dashboard', () => ({
  getDashboardStats: vi.fn(),
}))
vi.mock('@/lib/api/audit', () => ({
  listRecentAudit: vi.fn().mockResolvedValue({ events: [] }),
}))
vi.mock('@/lib/api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  getOrganization: vi.fn(),
}))

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}))

const authUser = { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Админ Админович' }
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: authUser,
    hydrated: true,
    isAuthenticated: true,
    logout: () => {},
  }),
}))

import { getDashboardStats } from '@/lib/api/dashboard'
const stats = vi.mocked(getDashboardStats)

function renderPage() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <DashboardPage />
    </Wrapper>,
  )
}

beforeEach(() => {
  stats.mockReset()
  replace.mockReset()
  authUser.name = 'Админ Админович'
})

describe('DashboardPage', () => {
  it('renders hero title "Обзор платформы"', () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 0 },
    })
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Обзор платформы')
  })

  it('hero subtitle includes date + pluralised week count (0 → "регистраций")', async () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 0 },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/0 регистраций за неделю/)).toBeInTheDocument()
    })
    expect(screen.getByText(/· 0 регистраций за неделю/).textContent).toMatch(/[А-ЯЁ]/)
  })

  it('hero subtitle — singular form for 1 registration', async () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 1 },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/1 регистрация за неделю/)).toBeInTheDocument()
    })
  })

  it('hero subtitle — few form for 3', async () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 3 },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/3 регистрации за неделю/)).toBeInTheDocument()
    })
  })

  it('renders exactly 4 stat cards in the grid (no New registrations card)', async () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 1, craneProfiles: 2, cranes: 3, memberships: 4 },
      thisWeek: { newRegistrations: 7 },
    })
    renderPage()
    await waitFor(() => {
      expect(
        screen.getAllByRole('link', { name: /Организации|Крановщики|Краны|Активные найма/ }),
      ).toHaveLength(4)
    })
    expect(screen.queryByText(/Новые регистрации \(7 дней\)/)).toBeNull()
  })

  it('does NOT render PendingAttentionCallout when all pending counts are zero', async () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 0 },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    })
    expect(screen.queryByText('Ожидают модерации')).toBeNull()
  })

  it('renders PendingAttentionCallout when any pending count > 0', async () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 3, organizationOperators: 0, cranes: 1 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 0 },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Ожидают модерации')).toBeInTheDocument()
    })
    expect(screen.getByText(/— 4/)).toBeInTheDocument()
  })

  it('renders OrganizationsOverview + RecentActivity in a 2-col grid', async () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 0 },
    })
    const { container } = renderPage()
    await waitFor(() => {
      expect(screen.getByText('Недавние организации')).toBeInTheDocument()
    })
    expect(screen.getByText('Последние события')).toBeInTheDocument()
    const grid = container.querySelector('.lg\\:grid-cols-\\[2fr_1fr\\]')
    expect(grid).not.toBeNull()
  })
})
