import type { CraneProfile } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CraneProfilesPage from './page'

vi.mock('@/lib/api/crane-profiles', () => ({
  listCraneProfiles: vi.fn(),
  getCraneProfile: vi.fn(),
  approveCraneProfile: vi.fn(),
  rejectCraneProfile: vi.fn(),
}))
vi.mock('@/lib/api/cranes', () => ({
  listCranes: vi.fn(),
  getCrane: vi.fn(),
  approveCrane: vi.fn(),
  rejectCrane: vi.fn(),
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
  usePathname: () => '/crane-profiles',
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
const list = vi.mocked(listCraneProfiles)

function makeProfile(overrides: Partial<CraneProfile> = {}): CraneProfile {
  return {
    id: 'cp-1',
    userId: 'u-1',
    firstName: 'Иван',
    lastName: 'Иванов',
    patronymic: 'Петрович',
    iin: '900101300001',
    phone: '+77010000001',
    avatarUrl: null,
    approvalStatus: 'pending',
    rejectionReason: null,
    approvedAt: null,
    rejectedAt: null,
    licenseStatus: 'valid',
    licenseExpiresAt: null,
    licenseUrl: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <CraneProfilesPage />
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
  list.mockResolvedValue({ items: [makeProfile()], nextCursor: null })
})

describe('CraneProfilesPage', () => {
  it('renders heading and rows', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Крановщики' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText('Иванов Иван Петрович').length).toBeGreaterThan(0)
    })
  })

  it('passes approvalStatus filter to listCraneProfiles', async () => {
    searchParams.get.mockImplementation((k: string) => (k === 'approval' ? 'pending' : null))
    renderPage()
    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ approvalStatus: 'pending', limit: 20 }),
      )
    })
  })

  it('filters rows client-side by license status', async () => {
    list.mockResolvedValue({
      items: [
        makeProfile({ id: 'cp-1', licenseStatus: 'valid' }),
        makeProfile({ id: 'cp-2', licenseStatus: 'expired', firstName: 'Пётр' }),
      ],
      nextCursor: null,
    })
    searchParams.get.mockImplementation((k: string) => (k === 'license' ? 'expired' : null))
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText('Иванов Пётр Петрович').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('Иванов Иван Петрович')).not.toBeInTheDocument()
  })

  it('clicking a row calls router.replace with ?open=<id>', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getAllByText('Иванов Иван Петрович').length).toBeGreaterThan(0),
    )
    const row = screen.getAllByText('Иванов Иван Петрович')[0]!
    await userEvent.click(row)
    expect(replace).toHaveBeenCalledWith('/crane-profiles?open=cp-1', { scroll: false })
  })
})
