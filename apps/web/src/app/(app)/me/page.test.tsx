import type { CraneProfile, MeStatusResponse } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MePage from './page'

vi.mock('@/lib/api/crane-profiles', () => ({
  getMeStatus: vi.fn(),
  requestLicenseUploadUrl: vi.fn(),
  confirmLicense: vi.fn(),
  listCraneProfiles: vi.fn(),
  getCraneProfile: vi.fn(),
  approveCraneProfile: vi.fn(),
  rejectCraneProfile: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  usePathname: () => '/me',
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
    patronymic: 'Петрович',
    iin: '900101300001',
    phone: '+77010000001',
    avatarUrl: null,
    approvalStatus: 'approved',
    rejectionReason: null,
    approvedAt: '2026-04-01T10:00:00Z',
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
      <MePage />
    </Wrapper>,
  )
}

beforeEach(() => {
  getStatus.mockReset()
  push.mockReset()
  replace.mockReset()
  authUser.user = { id: 'u-1', role: 'operator', organizationId: null, name: 'Иван' }
  getStatus.mockResolvedValue(makeStatus())
})

describe('MePage', () => {
  it('renders "Мой профиль" heading', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Мой профиль' })).toBeInTheDocument()
  })

  it('non-operator is redirected', () => {
    authUser.user = { id: 'u-2', role: 'owner', organizationId: 'org-1', name: 'Owner' }
    renderPage()
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('canWork=true → renders success status card', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Вы можете работать')).toBeInTheDocument())
  })

  it('canWork=false → renders danger + reasons list', async () => {
    getStatus.mockResolvedValue(
      makeStatus({
        canWork: false,
        canWorkReasons: ['Профиль отклонён платформой'],
        licenseStatus: 'valid',
      }),
    )
    renderPage()
    await waitFor(() => expect(screen.getByText('Работа заблокирована')).toBeInTheDocument())
    expect(screen.getByText('Профиль отклонён платформой')).toBeInTheDocument()
  })

  it('renders identity card with ФИО и ИИН', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Иванов Иван Петрович')).toBeInTheDocument())
    expect(screen.getByText('900101300001')).toBeInTheDocument()
  })

  it('renders license card with Обновить button', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument(),
    )
  })

  it('empty memberships → empty-state hint', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/Пока нет активных трудоустройств/)).toBeInTheDocument(),
    )
  })

  it('error state shows retry', async () => {
    getStatus.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Не удалось загрузить профиль')).toBeInTheDocument(),
    )
  })
})
