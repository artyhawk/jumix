import type { IncidentWithRelations } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/incidents', () => ({
  getIncident: vi.fn(),
  acknowledgeIncident: vi.fn(),
  resolveIncident: vi.fn(),
  escalateIncident: vi.fn(),
  deEscalateIncident: vi.fn(),
  listOwnerIncidents: vi.fn(),
  listMyIncidents: vi.fn(),
  createIncident: vi.fn(),
  requestIncidentPhotoUploadUrl: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockUser: {
  value: {
    id: string
    role: 'superadmin' | 'owner' | 'operator'
    organizationId: string | null
    name: string
  }
} = {
  value: { id: 'u-owner', role: 'owner', organizationId: 'org-1', name: 'Owner' },
}
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: mockUser.value,
    hydrated: true,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}))

import * as incidentsApi from '@/lib/api/incidents'
import { IncidentDrawer } from './incident-drawer'

const get = vi.mocked(incidentsApi.getIncident)
const ack = vi.mocked(incidentsApi.acknowledgeIncident)
const resolve = vi.mocked(incidentsApi.resolveIncident)
const escalate = vi.mocked(incidentsApi.escalateIncident)
const deEsc = vi.mocked(incidentsApi.deEscalateIncident)

function makeIncident(overrides: Partial<IncidentWithRelations> = {}): IncidentWithRelations {
  return {
    id: 'inc-1',
    reporter: { id: 'u-1', name: 'Петров Иван', phone: '+77011234567' },
    organizationId: 'org-1',
    shiftId: null,
    siteId: null,
    craneId: null,
    type: 'crane_malfunction',
    severity: 'warning',
    status: 'submitted',
    description: 'Шум при подъёме стрелы — требуется проверка ТО',
    reportedAt: '2026-04-25T10:00:00Z',
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    resolvedAt: null,
    resolvedByUserId: null,
    resolutionNotes: null,
    latitude: null,
    longitude: null,
    photos: [],
    shift: null,
    site: null,
    crane: null,
    createdAt: '2026-04-25T10:00:00Z',
    updatedAt: '2026-04-25T10:00:00Z',
    ...overrides,
  }
}

function renderDrawer(id: string | null) {
  const { Wrapper } = createQueryWrapper()
  return render(<IncidentDrawer id={id} onOpenChange={() => {}} />, { wrapper: Wrapper })
}

beforeEach(() => {
  get.mockReset()
  ack.mockReset()
  resolve.mockReset()
  escalate.mockReset()
  deEsc.mockReset()
  mockUser.value = { id: 'u-owner', role: 'owner', organizationId: 'org-1', name: 'Owner' }
})

describe('IncidentDrawer', () => {
  it('does not render when id is null', () => {
    renderDrawer(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders incident details', async () => {
    get.mockResolvedValueOnce(makeIncident())
    renderDrawer('inc-1')
    await waitFor(() => {
      expect(screen.getByText('Петров Иван')).toBeInTheDocument()
    })
    expect(screen.getByText(/Шум при подъёме/)).toBeInTheDocument()
    expect(screen.getByText('Внимание')).toBeInTheDocument()
    expect(screen.getByText('Подано')).toBeInTheDocument()
  })

  it('submitted owner footer shows Подтвердить + Эскалировать', async () => {
    get.mockResolvedValueOnce(makeIncident({ status: 'submitted' }))
    renderDrawer('inc-1')
    await screen.findByRole('button', { name: 'Подтвердить' })
    expect(screen.getByRole('button', { name: 'Эскалировать' })).toBeInTheDocument()
  })

  it('clicking Подтвердить calls acknowledgeIncident', async () => {
    get.mockResolvedValueOnce(makeIncident({ status: 'submitted' }))
    ack.mockResolvedValueOnce({ ...makeIncident({ status: 'acknowledged' }) })
    renderDrawer('inc-1')
    const btn = await screen.findByRole('button', { name: 'Подтвердить' })
    await userEvent.click(btn)
    await waitFor(() => expect(ack).toHaveBeenCalledWith('inc-1'))
  })

  it('acknowledged owner shows Эскалировать + Закрыть footer button', async () => {
    get.mockResolvedValueOnce(makeIncident({ status: 'acknowledged' }))
    renderDrawer('inc-1')
    // Wait for full body to load (description visible)
    await screen.findByText(/Шум при подъёме/)
    expect(screen.getByRole('button', { name: 'Эскалировать' })).toBeInTheDocument()
    // Footer "Закрыть" — primary action; X-close button также имеет aria-label
    // "Закрыть" но он icon-only. Проверяем что есть >=2 кнопок с этим именем.
    const closeButtons = screen.getAllByRole('button', { name: 'Закрыть' })
    expect(closeButtons.length).toBeGreaterThanOrEqual(2)
  })

  it('resolve flow opens textarea + confirms', async () => {
    get.mockResolvedValueOnce(makeIncident({ status: 'acknowledged' }))
    resolve.mockResolvedValueOnce({ ...makeIncident({ status: 'resolved' }) })
    renderDrawer('inc-1')
    await screen.findByText(/Шум при подъёме/)
    // Footer Закрыть button (not X-close icon-only button) — has visible text.
    function findFooterClose(): HTMLElement {
      const all = screen.getAllByRole('button', { name: 'Закрыть' })
      const found = all.find((btn) => btn.textContent && btn.textContent.trim().length > 0)
      if (!found) throw new Error('footer Закрыть button not found')
      return found
    }
    await userEvent.click(findFooterClose())
    const textarea = await screen.findByPlaceholderText(/решение/)
    await userEvent.type(textarea, 'Кран отремонтирован')
    // After opening resolveOpen state, footer changes; confirm "Закрыть" still
    // has visible text. Re-locate.
    await userEvent.click(findFooterClose())
    await waitFor(() => {
      expect(resolve).toHaveBeenCalledWith('inc-1', 'Кран отремонтирован')
    })
  })

  it('escalated + owner: shows read-only message; superadmin sees actions', async () => {
    get.mockResolvedValue(makeIncident({ status: 'escalated' }))
    const { unmount } = renderDrawer('inc-1')
    // Status badge label "Эскалировано" appears in body
    await waitFor(() => {
      expect(screen.getByText('Эскалировано')).toBeInTheDocument()
    })
    expect(screen.getByText(/ожидает решения суперадмина/)).toBeInTheDocument()
    unmount()

    // Re-render как superadmin
    mockUser.value = { id: 'u-sa', role: 'superadmin', organizationId: null, name: 'SA' }
    renderDrawer('inc-1')
    await screen.findByRole('button', { name: 'Снять эскалацию' })
  })

  it('resolved status: footer hidden (terminal)', async () => {
    get.mockResolvedValueOnce(
      makeIncident({ status: 'resolved', resolvedAt: '2026-04-26T10:00:00Z' }),
    )
    renderDrawer('inc-1')
    await screen.findByText('Решено')
    expect(screen.queryByRole('button', { name: /Подтвердить/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Эскалировать/ })).toBeNull()
  })

  it('foreign org owner: footer hidden', async () => {
    mockUser.value = { id: 'u-other', role: 'owner', organizationId: 'org-other', name: 'Other' }
    get.mockResolvedValueOnce(makeIncident({ status: 'submitted', organizationId: 'org-1' }))
    renderDrawer('inc-1')
    await screen.findByText('Подано')
    expect(screen.queryByRole('button', { name: /Подтвердить/ })).toBeNull()
  })

  it('renders photos gallery when present', async () => {
    get.mockResolvedValueOnce(
      makeIncident({
        photos: [
          {
            id: 'p-1',
            storageKey: 'pending/u-1/abc/photo.jpg',
            url: 'https://example.com/p1.jpg',
            uploadedAt: '2026-04-25T10:01:00Z',
          },
        ],
      }),
    )
    renderDrawer('inc-1')
    await waitFor(() => {
      expect(screen.getByText(/Фото \(1\)/)).toBeInTheDocument()
    })
    const img = screen.getByRole('img', { name: /Фото p-1/ })
    expect(img).toHaveAttribute('src', 'https://example.com/p1.jpg')
  })

  it('renders coordinate when latitude/longitude present', async () => {
    get.mockResolvedValueOnce(makeIncident({ latitude: 51.12872, longitude: 71.4306 }))
    renderDrawer('inc-1')
    await waitFor(() => {
      expect(screen.getByText(/51\.12872, 71\.43060/)).toBeInTheDocument()
    })
  })

  it('shows error state when getIncident fails', async () => {
    get.mockRejectedValueOnce(new Error('Server error'))
    renderDrawer('inc-1')
    await waitFor(() => {
      expect(screen.getByText('Не удалось загрузить происшествие')).toBeInTheDocument()
    })
  })
})
