import type { CraneProfile, MeStatusResponse } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LicensePage from './page'

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
  usePathname: () => '/license',
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

function makeProfile(overrides: Partial<CraneProfile> = {}): CraneProfile {
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
    ...overrides,
  }
}

function makeStatus(overrides: Partial<MeStatusResponse> = {}): MeStatusResponse {
  return {
    profile: makeProfile(),
    memberships: [],
    licenseStatus: 'valid',
    canWork: true,
    canWorkReasons: [],
    ...overrides,
  }
}

function renderPage() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <LicensePage />
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

describe('LicensePage', () => {
  it('renders heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Удостоверение крановщика' })).toBeInTheDocument()
  })

  it('non-operator redirected', () => {
    authUser.user = { id: 'u-2', role: 'owner', organizationId: 'org-1', name: 'Owner' }
    renderPage()
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('has license → shows Обновить button + expiry date', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Обновить удостоверение' })).toBeInTheDocument(),
    )
    expect(screen.getByText(/20 апреля 2027/)).toBeInTheDocument()
  })

  it('no license → empty state with Загрузить button', async () => {
    getStatus.mockResolvedValue(
      makeStatus({
        licenseStatus: 'missing',
        profile: makeProfile({ licenseStatus: 'missing', licenseExpiresAt: null }),
      }),
    )
    renderPage()
    await waitFor(() => expect(screen.getByText('Удостоверение не загружено')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Загрузить удостоверение' })).toBeInTheDocument()
  })

  it('expired → danger warning banner', async () => {
    getStatus.mockResolvedValue(
      makeStatus({
        licenseStatus: 'expired',
        profile: makeProfile({ licenseStatus: 'expired', licenseExpiresAt: '2024-01-01' }),
      }),
    )
    renderPage()
    await waitFor(() => expect(screen.getByText(/Срок действия истёк/)).toBeInTheDocument())
  })

  it('expiring_soon → warning banner', async () => {
    getStatus.mockResolvedValue(
      makeStatus({
        licenseStatus: 'expiring_soon',
        profile: makeProfile({ licenseStatus: 'expiring_soon' }),
      }),
    )
    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/Срок действия скоро истекает/)).toBeInTheDocument(),
    )
  })

  it('?upload=true → dialog appears; click Обновить writes ?upload=true', async () => {
    searchParams.get.mockImplementation((k: string) => (k === 'upload' ? 'true' : null))
    renderPage()
    await waitFor(() => expect(screen.getByText('Загрузка удостоверения')).toBeInTheDocument())
  })

  it('click Обновить удостоверение → replace /license?upload=true', async () => {
    renderPage()
    const btn = await screen.findByRole('button', { name: 'Обновить удостоверение' })
    await userEvent.click(btn)
    expect(replace).toHaveBeenCalledWith('/license?upload=true', { scroll: false })
  })
})
