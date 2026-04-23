import type { CraneProfile, OrganizationOperator } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  createHireRequest: vi.fn(),
  blockOrganizationOperator: vi.fn(),
  activateOrganizationOperator: vi.fn(),
  terminateOrganizationOperator: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { listCraneProfiles } from '@/lib/api/crane-profiles'
import { AppError } from '@/lib/api/errors'
import { createHireRequest } from '@/lib/api/organization-operators'
import { toast } from 'sonner'
import { CreateHireRequestDialog } from './create-hire-request-dialog'

const list = vi.mocked(listCraneProfiles)
const create = vi.mocked(createHireRequest)

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
    approvedAt: '2026-04-20T10:00:00Z',
    rejectedAt: null,
    licenseStatus: 'valid',
    licenseExpiresAt: '2027-04-20',
    licenseUrl: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

function renderDialog() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <CreateHireRequestDialog open={true} onOpenChange={() => {}} />
    </Wrapper>,
  )
}

beforeEach(() => {
  list.mockReset()
  create.mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
  list.mockResolvedValue({ items: [makeProfile()], nextCursor: null })
})

describe('CreateHireRequestDialog', () => {
  it('renders step 1 with hint when query is too short', () => {
    renderDialog()
    expect(screen.getByText('Нанять крановщика')).toBeInTheDocument()
    expect(screen.getByText('Введите минимум 2 символа')).toBeInTheDocument()
    // results UI hidden until 2+ chars даже если background-query fire'ит
    expect(screen.queryByText('900101300001')).not.toBeInTheDocument()
  })

  it('triggers search when user types 2+ chars (debounced)', async () => {
    renderDialog()
    const searchInput = screen.getByLabelText('Поиск крановщика')
    await userEvent.type(searchInput, 'Ив')
    await waitFor(
      () => {
        expect(list).toHaveBeenCalledWith(
          expect.objectContaining({ approvalStatus: 'approved', search: 'Ив' }),
        )
      },
      { timeout: 1500 },
    )
  })

  it('renders profile results after search', async () => {
    renderDialog()
    const searchInput = screen.getByLabelText('Поиск крановщика')
    await userEvent.type(searchInput, 'Ив')
    await waitFor(() => expect(screen.getAllByText('Иванов Иван Петрович').length).toBe(1))
    expect(screen.getByText('900101300001')).toBeInTheDocument()
  })

  it('moves to step 2 on profile selection', async () => {
    renderDialog()
    const searchInput = screen.getByLabelText('Поиск крановщика')
    await userEvent.type(searchInput, 'Ив')
    await waitFor(() => expect(screen.getAllByText('Иванов Иван Петрович').length).toBe(1))
    const profileCard = screen.getByRole('button', { name: /Иванов Иван/ })
    await userEvent.click(profileCard)
    expect(screen.getByRole('button', { name: 'Создать заявку' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument()
  })

  it('shows license warning for missing license', async () => {
    list.mockResolvedValue({
      items: [makeProfile({ licenseStatus: 'missing' })],
      nextCursor: null,
    })
    renderDialog()
    const searchInput = screen.getByLabelText('Поиск крановщика')
    await userEvent.type(searchInput, 'Ив')
    await waitFor(() => expect(screen.getAllByText('Иванов Иван Петрович').length).toBe(1))
    await userEvent.click(screen.getByRole('button', { name: /Иванов Иван/ }))
    expect(screen.getByText('Удостоверение не загружено')).toBeInTheDocument()
  })

  it('shows license warning for expired license', async () => {
    list.mockResolvedValue({
      items: [makeProfile({ licenseStatus: 'expired' })],
      nextCursor: null,
    })
    renderDialog()
    const searchInput = screen.getByLabelText('Поиск крановщика')
    await userEvent.type(searchInput, 'Ив')
    await waitFor(() => expect(screen.getAllByText('Иванов Иван Петрович').length).toBe(1))
    await userEvent.click(screen.getByRole('button', { name: /Иванов Иван/ }))
    expect(screen.getByText('Удостоверение просрочено')).toBeInTheDocument()
  })

  it('submit calls createHireRequest with profileId + hiredAt', async () => {
    create.mockResolvedValueOnce({
      id: 'h-1',
      craneProfileId: 'cp-1',
    } as unknown as OrganizationOperator)
    renderDialog()
    const searchInput = screen.getByLabelText('Поиск крановщика')
    await userEvent.type(searchInput, 'Ив')
    await waitFor(() => expect(screen.getAllByText('Иванов Иван Петрович').length).toBe(1))
    await userEvent.click(screen.getByRole('button', { name: /Иванов Иван/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Создать заявку' }))
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ craneProfileId: 'cp-1' })),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalled()
  })

  it('409 OPERATOR_ALREADY_HIRED shows specific toast', async () => {
    create.mockRejectedValueOnce(
      new AppError({ code: 'OPERATOR_ALREADY_HIRED', message: 'Already hired', statusCode: 409 }),
    )
    renderDialog()
    const searchInput = screen.getByLabelText('Поиск крановщика')
    await userEvent.type(searchInput, 'Ив')
    await waitFor(() => expect(screen.getAllByText('Иванов Иван Петрович').length).toBe(1))
    await userEvent.click(screen.getByRole('button', { name: /Иванов Иван/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Создать заявку' }))
    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'Этот крановщик уже работает в вашей компании',
      ),
    )
  })

  it('Назад returns to step 1', async () => {
    renderDialog()
    const searchInput = screen.getByLabelText('Поиск крановщика')
    await userEvent.type(searchInput, 'Ив')
    await waitFor(() => expect(screen.getAllByText('Иванов Иван Петрович').length).toBe(1))
    await userEvent.click(screen.getByRole('button', { name: /Иванов Иван/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByLabelText('Поиск крановщика')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Создать заявку' })).not.toBeInTheDocument()
  })
})
