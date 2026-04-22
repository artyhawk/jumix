import type { Site } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SitesPage from './page'

vi.mock('@/lib/api/sites', () => ({
  listSites: vi.fn(),
  getSite: vi.fn(),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  completeSite: vi.fn(),
  archiveSite: vi.fn(),
  activateSite: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// MapPicker и BaseMap монтируют WebGL — для page-теста нам нужен только
// list-surface, но CreateSiteDialog тащит MapPicker. Заменяем на no-op.
vi.mock('@/components/map/map-picker', () => ({
  MapPicker: () => <div data-testid="map-picker" />,
}))

const push = vi.fn()
const replace = vi.fn()
const searchParams = { get: vi.fn<(k: string) => string | null>(), toString: vi.fn(() => '') }
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/sites',
}))

const authUser = {
  user: { id: 'u-1', role: 'owner', organizationId: 'org-1', name: 'Owner' } as {
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
    name: 'ЖК «Астана Парк»',
    address: 'ул. Абая, 15',
    latitude: 51.169392,
    longitude: 71.449074,
    radiusM: 200,
    status: 'active',
    notes: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <SitesPage />
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
  list.mockResolvedValue({ items: [makeSite()], nextCursor: null })
})

describe('SitesPage', () => {
  it('renders heading and list rows', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Объекты' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText('ЖК «Астана Парк»').length).toBeGreaterThan(0)
    })
  })

  it('owner sees "Новый объект" button', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('ЖК «Астана Парк»').length).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: /Новый объект/ })).toBeInTheDocument()
  })

  it('superadmin does NOT see create button', async () => {
    authUser.user = { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Admin' }
    renderPage()
    await waitFor(() => expect(screen.getAllByText('ЖК «Астана Парк»').length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: /Новый объект/ })).toBeNull()
  })

  it('clicking "Новый объект" updates URL with ?create=true', async () => {
    renderPage()
    const btn = await screen.findByRole('button', { name: /Новый объект/ })
    await userEvent.click(btn)
    expect(replace).toHaveBeenCalledWith('/sites?create=true', { scroll: false })
  })

  it('?create=true in URL opens CreateSiteDialog (step 1 visible)', async () => {
    searchParams.get.mockImplementation((k: string) => (k === 'create' ? 'true' : null))
    renderPage()
    // Step 1 показывает поле "Название" в dialog
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/ЖК|Парк/)).toBeInTheDocument()
    })
    // Step indicator "Данные" — uniquely inside dialog
    expect(screen.getByText('Данные')).toBeInTheDocument()
  })

  it('clicking a row calls router.replace with ?open=<id>', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('ЖК «Астана Парк»').length).toBeGreaterThan(0))
    const row = screen.getAllByText('ЖК «Астана Парк»')[0]!
    await userEvent.click(row)
    expect(replace).toHaveBeenCalledWith('/sites?open=s-1', { scroll: false })
  })

  it('passes status filter to listSites', async () => {
    searchParams.get.mockImplementation((k: string) => (k === 'status' ? 'completed' : null))
    renderPage()
    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', limit: 20 }))
    })
  })

  it('operator is redirected away', () => {
    authUser.user = { id: 'u-2', role: 'operator', organizationId: null, name: 'Operator' }
    renderPage()
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('empty state for owner shows "Создать первый объект" button', async () => {
    list.mockResolvedValueOnce({ items: [], nextCursor: null })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/У вас пока нет объектов/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Создать первый объект/ })).toBeInTheDocument()
  })
})
