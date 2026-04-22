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
