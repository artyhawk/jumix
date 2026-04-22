import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from './page'

vi.mock('@/lib/api/dashboard', () => ({
  getDashboardStats: vi.fn(),
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
  it('renders hero greeting with user name', async () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 0 },
    })
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Добро пожаловать, Админ Админович',
    )
  })

  it('renders hero subtitle with formatted Russian date and "Обзор Jumix"', () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 0 },
    })
    renderPage()
    const subtitle = screen.getByText(/Обзор Jumix/)
    expect(subtitle).toBeInTheDocument()
    // e.g. "Среда, 22 апреля 2026 г. · Обзор Jumix" — starts with capital
    expect(subtitle.textContent?.charAt(0)).toMatch(/[А-ЯЁ]/)
  })

  it('falls back to "Администратор" when user.name is empty', () => {
    authUser.name = ''
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 0 },
    })
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Добро пожаловать, Администратор',
    )
  })

  it('does not render "АКТИВНЫЕ" section label', () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 0 },
    })
    renderPage()
    // no <h2> section label above the grid
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  it('does not render welcome filler card', () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 0 },
    })
    renderPage()
    expect(screen.queryByText(/Добро пожаловать, администратор\./i)).toBeNull()
  })

  it('renders PendingAttentionCallout empty state when all counts are zero', async () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 0 },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Всё одобрено')).toBeInTheDocument()
    })
    expect(screen.getByText('Нет заявок на рассмотрение')).toBeInTheDocument()
  })

  it('renders PendingAttentionCallout populated when counts > 0', async () => {
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

  it('New registrations stat card has no brand accent border', async () => {
    stats.mockResolvedValue({
      pending: { craneProfiles: 0, organizationOperators: 0, cranes: 0 },
      active: { organizations: 0, craneProfiles: 0, cranes: 0, memberships: 0 },
      thisWeek: { newRegistrations: 5 },
    })
    const { container } = renderPage()
    await waitFor(() => {
      // NumberCounter renders the value as 5 once resolved
      expect(screen.getByText('Новые регистрации (7 дней)')).toBeInTheDocument()
    })
    expect(container.querySelector('.border-brand-500\\/40')).toBeNull()
  })
})
