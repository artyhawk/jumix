import type { Crane } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CranesPage from './page'

vi.mock('@/lib/api/cranes', () => ({
  listCranes: vi.fn(),
  getCrane: vi.fn(),
  approveCrane: vi.fn(),
  rejectCrane: vi.fn(),
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
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const push = vi.fn()
const replace = vi.fn()
const searchParams = { get: vi.fn<(k: string) => string | null>(), toString: vi.fn(() => '') }
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/cranes',
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Admin' },
    hydrated: true,
    isAuthenticated: true,
    logout: () => {},
  }),
}))

import { listCranes } from '@/lib/api/cranes'
const list = vi.mocked(listCranes)

function makeCrane(overrides: Partial<Crane> = {}): Crane {
  return {
    id: 'c-1',
    organizationId: 'o-1',
    siteId: null,
    type: 'tower',
    model: 'Liebherr 200EC-B',
    inventoryNumber: 'INV-001',
    capacityTon: 8,
    boomLengthM: 50,
    yearManufactured: 2020,
    status: 'active',
    approvalStatus: 'approved',
    rejectionReason: null,
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
      <CranesPage />
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
  list.mockResolvedValue({ items: [makeCrane()], nextCursor: null })
})

describe('CranesPage', () => {
  it('renders heading and rows', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Краны' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText('Liebherr 200EC-B').length).toBeGreaterThan(0)
    })
  })

  it('passes approvalStatus + operational status to listCranes', async () => {
    searchParams.get.mockImplementation((k: string) => {
      if (k === 'approval') return 'pending'
      if (k === 'status') return 'maintenance'
      return null
    })
    renderPage()
    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalStatus: 'pending',
          status: 'maintenance',
          limit: 20,
        }),
      )
    })
  })

  it('filters rows client-side by crane type', async () => {
    list.mockResolvedValue({
      items: [
        makeCrane({ id: 'c-1', type: 'tower', model: 'Liebherr Tower' }),
        makeCrane({ id: 'c-2', type: 'mobile', model: 'Tadano Mobile' }),
      ],
      nextCursor: null,
    })
    searchParams.get.mockImplementation((k: string) => (k === 'type' ? 'mobile' : null))
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText('Tadano Mobile').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('Liebherr Tower')).not.toBeInTheDocument()
  })

  it('clicking a row calls router.replace with ?open=<id>', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Liebherr 200EC-B').length).toBeGreaterThan(0))
    const row = screen.getAllByText('Liebherr 200EC-B')[0]!
    await userEvent.click(row)
    expect(replace).toHaveBeenCalledWith('/cranes?open=c-1', { scroll: false })
  })
})
