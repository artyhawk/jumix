import type { OwnerDashboardStats, Site } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OwnerDashboard } from './owner-dashboard'

vi.mock('@/lib/api/sites', () => ({
  listSites: vi.fn(),
  getSite: vi.fn(),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  completeSite: vi.fn(),
  archiveSite: vi.fn(),
  activateSite: vi.fn(),
}))
vi.mock('@/lib/api/cranes', () => ({
  listCranes: vi.fn(async () => ({ items: [], nextCursor: null })),
  getCrane: vi.fn(),
}))
vi.mock('@/lib/api/dashboard', () => ({
  getDashboardStats: vi.fn(),
  getOwnerDashboardStats: vi.fn(),
}))

vi.mock('@/components/map/base-map', () => ({
  BaseMap: () => <div data-testid="base-map" />,
}))
vi.mock('@/components/map/sites-layer', () => ({
  SitesLayer: () => null,
}))
vi.mock('@/components/map/cranes-layer', () => ({
  CranesLayer: () => null,
}))

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}))

const authUser = {
  user: { id: 'u-1', role: 'owner', organizationId: 'org-1', name: 'Ербол' } as {
    id: string
    role: 'superadmin' | 'owner' | 'operator'
    organizationId: string | null
    name: string
  },
  hydrated: true,
  isAuthenticated: true,
  logout: vi.fn(),
}
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authUser,
}))

import { getOwnerDashboardStats } from '@/lib/api/dashboard'
import { listSites } from '@/lib/api/sites'
const list = vi.mocked(listSites)
const getOwnerStats = vi.mocked(getOwnerDashboardStats)

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 's-1',
    organizationId: 'org-1',
    name: 'ЖК «Парк»',
    address: 'ул. Абая, 1',
    latitude: 51.17,
    longitude: 71.45,
    radiusM: 200,
    status: 'active',
    notes: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

function makeStats(overrides: Partial<OwnerDashboardStats> = {}): OwnerDashboardStats {
  return {
    active: { sites: 0, cranes: 0, memberships: 0 },
    pending: { cranes: 0, hires: 0 },
    ...overrides,
  }
}

function renderDash() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <OwnerDashboard />
    </Wrapper>,
  )
}

beforeEach(() => {
  list.mockReset()
  getOwnerStats.mockReset()
  push.mockReset()
  authUser.user = { id: 'u-1', role: 'owner', organizationId: 'org-1', name: 'Ербол' }
  list.mockResolvedValue({ items: [], nextCursor: null })
  getOwnerStats.mockResolvedValue(makeStats())
})

describe('OwnerDashboard', () => {
  it('renders personalised hero with user name', async () => {
    renderDash()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Здравствуйте, Ербол')
  })

  it('hero fallback when user has no name', async () => {
    authUser.user = { id: 'u-1', role: 'owner', organizationId: 'org-1', name: '' }
    renderDash()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Обзор организации')
  })

  it('subtitle reflects active sites count with plural form', async () => {
    getOwnerStats.mockResolvedValue(makeStats({ active: { sites: 2, cranes: 0, memberships: 0 } }))
    renderDash()
    await waitFor(() => {
      expect(screen.getByText(/2 объекта активно/)).toBeInTheDocument()
    })
  })

  it('Активные объекты stat card links to /sites', async () => {
    getOwnerStats.mockResolvedValue(makeStats({ active: { sites: 3, cranes: 0, memberships: 0 } }))
    renderDash()
    await waitFor(() => {
      const card = screen.getByRole('link', { name: /Активные объекты/ })
      expect(card).toHaveAttribute('href', '/sites')
    })
  })

  it('Краны в работе stat card links to /my-cranes', async () => {
    getOwnerStats.mockResolvedValue(makeStats({ active: { sites: 0, cranes: 7, memberships: 0 } }))
    renderDash()
    await waitFor(() => {
      const card = screen.getByRole('link', { name: /Краны в работе/ })
      expect(card).toHaveAttribute('href', '/my-cranes')
    })
  })

  it('renders Активные операторы stat card linking to /my-operators', async () => {
    getOwnerStats.mockResolvedValue(makeStats({ active: { sites: 0, cranes: 0, memberships: 5 } }))
    renderDash()
    await waitFor(() => {
      const card = screen.getByRole('link', { name: /Активные операторы/ })
      expect(card).toHaveAttribute('href', '/my-operators')
    })
  })

  it('renders a single placeholder card for upcoming finance metric', async () => {
    renderDash()
    await waitFor(() => {
      expect(screen.getByText('Расходы за месяц')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Скоро').length).toBe(1)
    expect(screen.queryByText('Операторы на смене')).toBeNull()
  })

  it('renders OwnerSitesMap + RecentSitesList in 2-col grid', async () => {
    list.mockResolvedValue({ items: [makeSite()], nextCursor: null })
    const { container } = renderDash()
    await waitFor(() => {
      expect(screen.getByText('Карта объектов')).toBeInTheDocument()
      expect(screen.getByText('Недавние объекты')).toBeInTheDocument()
    })
    expect(container.querySelector('.lg\\:grid-cols-\\[2fr_1fr\\]')).not.toBeNull()
  })

  it('empty state in recent list shows create-first link', async () => {
    renderDash()
    await waitFor(() => {
      expect(screen.getAllByText(/Создать первый объект/).length).toBeGreaterThan(0)
    })
  })
})
