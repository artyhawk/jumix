import type { CraneProfile, MeStatusMembership, MeStatusResponse } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MembershipsPage from './page'

vi.mock('@/lib/api/crane-profiles', () => ({
  getMeStatus: vi.fn(),
  requestLicenseUploadUrl: vi.fn(),
  confirmLicense: vi.fn(),
  listCraneProfiles: vi.fn(),
  getCraneProfile: vi.fn(),
  approveCraneProfile: vi.fn(),
  rejectCraneProfile: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const replace = vi.fn()
const searchParams = { get: vi.fn<(k: string) => string | null>(), toString: vi.fn(() => '') }
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => searchParams,
  usePathname: () => '/memberships',
}))

const authUser: {
  user: {
    id: string
    role: 'superadmin' | 'owner' | 'operator'
    organizationId: string | null
    name: string
  }
} = {
  user: { id: 'u-1', role: 'operator', organizationId: null, name: 'Иван' },
}
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: authUser.user,
    hydrated: true,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}))

import { getMeStatus } from '@/lib/api/crane-profiles'
const getStatus = vi.mocked(getMeStatus)

function makeMembership(
  id: string,
  overrides: Partial<MeStatusMembership> = {},
): MeStatusMembership {
  return {
    id,
    organizationId: `org-${id}`,
    organizationName: `ТОО «Компания ${id}»`,
    approvalStatus: 'approved',
    status: 'active',
    hiredAt: '2026-01-15',
    approvedAt: '2026-01-16T10:00:00Z',
    rejectedAt: null,
    terminatedAt: null,
    rejectionReason: null,
    ...overrides,
  }
}

function makeProfile(): CraneProfile {
  return {
    id: 'cp-1',
    userId: 'u-1',
    firstName: 'Иван',
    lastName: 'Иванов',
    patronymic: null,
    iin: '900101300001',
    phone: '+77010000001',
    avatarUrl: null,
    approvalStatus: 'approved',
    rejectionReason: null,
    approvedAt: null,
    rejectedAt: null,
    licenseStatus: 'valid',
    licenseExpiresAt: '2027-04-20',
    licenseUrl: null,
    licenseVersion: 1,
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-04-01T10:00:00Z',
  }
}

function makeStatus(memberships: MeStatusMembership[] = []): MeStatusResponse {
  return {
    profile: makeProfile(),
    memberships,
    licenseStatus: 'valid',
    canWork: true,
    canWorkReasons: [],
  }
}

function renderPage() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <MembershipsPage />
    </Wrapper>,
  )
}

beforeEach(() => {
  getStatus.mockReset()
  replace.mockReset()
  searchParams.get.mockReset()
  searchParams.get.mockReturnValue(null)
  searchParams.toString.mockReturnValue('')
  authUser.user = { id: 'u-1', role: 'operator', organizationId: null, name: 'Иван' }
  getStatus.mockResolvedValue(makeStatus())
})

describe('MembershipsPage', () => {
  it('renders heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Компании' })).toBeInTheDocument()
  })

  it('non-operator redirected', () => {
    authUser.user = { id: 'u-2', role: 'superadmin', organizationId: null, name: 'Super' }
    renderPage()
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('empty → helpful hint', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Пока нет активных трудоустройств')).toBeInTheDocument(),
    )
  })

  it('with memberships → list renders', async () => {
    getStatus.mockResolvedValue(makeStatus([makeMembership('1'), makeMembership('2')]))
    renderPage()
    await waitFor(() => expect(screen.getByText('ТОО «Компания 1»')).toBeInTheDocument())
    expect(screen.getByText('ТОО «Компания 2»')).toBeInTheDocument()
  })

  it('clicking card updates ?open=<id>', async () => {
    getStatus.mockResolvedValue(makeStatus([makeMembership('1')]))
    renderPage()
    const card = await screen.findByRole('button', { name: /ТОО «Компания 1»/ })
    await userEvent.click(card)
    expect(replace).toHaveBeenCalledWith('/memberships?open=1', { scroll: false })
  })
})
