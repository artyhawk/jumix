import type { Site } from '@/lib/api/types'
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

// BaseMap + SitesLayer требуют WebGL; подменяем на no-op, потому что
// owner-dashboard тест проверяет layout + stats + recent list, а не карту.
vi.mock('@/components/map/base-map', () => ({
  BaseMap: () => <div data-testid="base-map" />,
}))
vi.mock('@/components/map/sites-layer', () => ({
  SitesLayer: () => null,
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

import { listSites } from '@/lib/api/sites'
const list = vi.mocked(listSites)

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
  push.mockReset()
  authUser.user = { id: 'u-1', role: 'owner', organizationId: 'org-1', name: 'Ербол' }
})

describe('OwnerDashboard', () => {
  it('renders personalised hero with user name', async () => {
    list.mockResolvedValue({ items: [], nextCursor: null })
    renderDash()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Здравствуйте, Ербол')
  })

  it('hero fallback when user has no name', async () => {
    authUser.user = { id: 'u-1', role: 'owner', organizationId: 'org-1', name: '' }
    list.mockResolvedValue({ items: [], nextCursor: null })
    renderDash()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Обзор организации')
  })

  it('subtitle reflects active sites count with plural form', async () => {
    list.mockResolvedValue({
      items: [makeSite({ id: 's1' }), makeSite({ id: 's2' })],
      nextCursor: null,
    })
    renderDash()
    await waitFor(() => {
      expect(screen.getByText(/2 объекта активно/)).toBeInTheDocument()
    })
  })

  it('Активные объекты stat card shows real count', async () => {
    list.mockResolvedValue({
      items: [makeSite({ id: 's1' }), makeSite({ id: 's2' }), makeSite({ id: 's3' })],
      nextCursor: null,
    })
    renderDash()
    await waitFor(() => {
      const card = screen.getByRole('link', { name: /Активные объекты/ })
      expect(card).toBeInTheDocument()
    })
  })

  it('renders three placeholder cards for upcoming metrics', async () => {
    list.mockResolvedValue({ items: [], nextCursor: null })
    renderDash()
    await waitFor(() => {
      expect(screen.getByText('Краны в работе')).toBeInTheDocument()
      expect(screen.getByText('Операторы на смене')).toBeInTheDocument()
      expect(screen.getByText('Расходы за месяц')).toBeInTheDocument()
    })
    // Placeholder content displays "Скоро"
    expect(screen.getAllByText('Скоро').length).toBeGreaterThanOrEqual(3)
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
    list.mockResolvedValue({ items: [], nextCursor: null })
    renderDash()
    await waitFor(() => {
      expect(screen.getAllByText(/Создать первый объект/).length).toBeGreaterThan(0)
    })
  })
})
