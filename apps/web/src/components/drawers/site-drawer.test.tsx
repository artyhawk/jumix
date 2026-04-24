import type { Site } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/sites', () => ({
  listSites: vi.fn(),
  getSite: vi.fn(),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  completeSite: vi.fn(),
  archiveSite: vi.fn(),
  activateSite: vi.fn(),
}))
vi.mock('@/lib/api/shifts', () => ({
  listOwnerShifts: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  listMyShifts: vi.fn(),
  getMyActiveShift: vi.fn(),
  getShift: vi.fn(),
  getAvailableCranes: vi.fn(),
  startShift: vi.fn(),
  pauseShift: vi.fn(),
  resumeShift: vi.fn(),
  endShift: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', role: 'owner', organizationId: 'org-1', name: 'Owner' },
    hydrated: true,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}))

import * as shiftsApi from '@/lib/api/shifts'
import * as sitesApi from '@/lib/api/sites'
import { SiteDrawer } from './site-drawer'

const get = vi.mocked(sitesApi.getSite)
const complete = vi.mocked(sitesApi.completeSite)
const archive = vi.mocked(sitesApi.archiveSite)
const activate = vi.mocked(sitesApi.activateSite)

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 's-1',
    organizationId: 'org-1',
    name: 'ЖК «Астана Парк»',
    address: 'ул. Абая, 15',
    latitude: 51.169392,
    longitude: 71.449074,
    radiusM: 250,
    status: 'active',
    notes: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

function renderDrawer(id: string | null) {
  const { Wrapper } = createQueryWrapper()
  return render(<SiteDrawer id={id} onOpenChange={() => {}} />, { wrapper: Wrapper })
}

beforeEach(() => {
  get.mockReset()
  complete.mockReset()
  archive.mockReset()
  activate.mockReset()
  // Default shift list — empty. Tests интересующиеся shift-ами переопределяют.
  vi.mocked(shiftsApi.listOwnerShifts).mockReset()
  vi.mocked(shiftsApi.listOwnerShifts).mockResolvedValue({ items: [], nextCursor: null })
})

describe('SiteDrawer', () => {
  it('does not render when id is null', () => {
    renderDrawer(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders site details when id provided', async () => {
    get.mockResolvedValueOnce(makeSite())
    renderDrawer('s-1')
    await waitFor(() => {
      expect(screen.getAllByText('ЖК «Астана Парк»').length).toBeGreaterThan(0)
    })
    expect(screen.getByText('ул. Абая, 15')).toBeInTheDocument()
    expect(screen.getByText(/250 м/)).toBeInTheDocument()
    expect(screen.getByText(/51\.16939/)).toBeInTheDocument()
  })

  it('active: shows Сдать + Архивировать', async () => {
    get.mockResolvedValue(makeSite({ status: 'active' }))
    renderDrawer('s-1')
    await screen.findByRole('button', { name: /Сдать/ })
    expect(screen.getByRole('button', { name: /Архивировать/ })).toBeInTheDocument()
  })

  it('active: clicking Сдать calls completeSite', async () => {
    get.mockResolvedValue(makeSite({ status: 'active' }))
    complete.mockResolvedValueOnce(makeSite({ status: 'completed' }))
    renderDrawer('s-1')
    const btn = await screen.findByRole('button', { name: /Сдать/ })
    await userEvent.click(btn)
    await waitFor(() => expect(complete).toHaveBeenCalledWith('s-1'))
  })

  it('completed: shows Вернуть в работу + Архивировать', async () => {
    get.mockResolvedValue(makeSite({ status: 'completed' }))
    renderDrawer('s-1')
    await screen.findByRole('button', { name: /В работу/ })
    expect(screen.getByRole('button', { name: /Архивировать/ })).toBeInTheDocument()
  })

  it('completed: clicking В работу calls activateSite', async () => {
    get.mockResolvedValue(makeSite({ status: 'completed' }))
    activate.mockResolvedValueOnce(makeSite({ status: 'active' }))
    renderDrawer('s-1')
    const btn = await screen.findByRole('button', { name: /В работу/ })
    await userEvent.click(btn)
    await waitFor(() => expect(activate).toHaveBeenCalledWith('s-1'))
  })

  it('archived: shows only Восстановить', async () => {
    get.mockResolvedValue(makeSite({ status: 'archived' }))
    renderDrawer('s-1')
    await screen.findByRole('button', { name: /Восстановить/ })
    expect(screen.queryByRole('button', { name: /Сдать/ })).toBeNull()
  })

  it('renders active shifts section (empty state)', async () => {
    get.mockResolvedValue(makeSite())
    vi.mocked(shiftsApi.listOwnerShifts).mockResolvedValueOnce({ items: [], nextCursor: null })
    renderDrawer('s-1')
    await waitFor(() => {
      expect(screen.getByText('Текущие смены')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText('Нет активных смен')).toBeInTheDocument()
    })
  })

  it('renders active shifts list with operator + crane info', async () => {
    get.mockResolvedValue(makeSite())
    vi.mocked(shiftsApi.listOwnerShifts).mockResolvedValueOnce({
      items: [
        {
          id: 'sh-1',
          craneId: 'c-1',
          operatorId: 'u-1',
          craneProfileId: 'cp-1',
          organizationId: 'org-1',
          siteId: 's-1',
          status: 'active',
          startedAt: '2026-04-24T09:00:00Z',
          endedAt: null,
          pausedAt: null,
          totalPauseSeconds: 0,
          notes: null,
          createdAt: '2026-04-24T09:00:00Z',
          updatedAt: '2026-04-24T09:00:00Z',
          crane: {
            id: 'c-1',
            model: 'Liebherr 550',
            inventoryNumber: 'INV-001',
            type: 'tower',
            capacityTon: 12,
          },
          site: {
            id: 's-1',
            name: 'Site',
            address: null,
            latitude: 51.128,
            longitude: 71.43,
            geofenceRadiusM: 200,
          },
          organization: { id: 'org-1', name: 'Org' },
          operator: {
            id: 'cp-1',
            firstName: 'Иван',
            lastName: 'Петров',
            patronymic: null,
          },
        },
      ],
      nextCursor: null,
    })
    renderDrawer('s-1')
    await waitFor(() => {
      expect(screen.getByText(/Петров Иван/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Liebherr 550/)).toBeInTheDocument()
    expect(screen.getByText('На смене')).toBeInTheDocument()
  })

  it('clicking Архивировать flows through inline confirmation', async () => {
    get.mockResolvedValue(makeSite({ status: 'active' }))
    archive.mockResolvedValueOnce(makeSite({ status: 'archived' }))
    renderDrawer('s-1')

    const archiveBtn = await screen.findByRole('button', { name: /Архивировать/ })
    await userEvent.click(archiveBtn)

    // Inline confirm: теперь показаны Отмена + Архивировать (primary)
    const confirm = await screen.findByRole('button', { name: 'Архивировать' })
    await userEvent.click(confirm)
    await waitFor(() => expect(archive).toHaveBeenCalledWith('s-1'))
  })
})
