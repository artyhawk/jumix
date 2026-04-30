import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: pushMock }),
}))

vi.mock('@/lib/api/auth', () => ({
  verifySmsCode: vi.fn(),
  requestSmsCode: vi.fn(),
}))

import { requestSmsCode, verifySmsCode } from '@/lib/api/auth'
import { AppError } from '@/lib/api/errors'
import { useAuthStore } from '@/lib/auth-store'
import { OtpForm } from './otp-form'

const mockedVerify = vi.mocked(verifySmsCode)
const mockedRequest = vi.mocked(requestSmsCode)

beforeEach(() => {
  pushMock.mockReset()
  mockedVerify.mockReset()
  mockedRequest.mockReset()
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    user: null,
    hydrated: true,
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('OtpForm', () => {
  it('renders 6 inputs', () => {
    render(<OtpForm phone="+77010001122" />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(6)
  })

  it('shows masked phone in subtitle', () => {
    render(<OtpForm phone="+77010001122" />)
    expect(screen.getByText(/\+7 701 ••• •• 22/)).toBeInTheDocument()
  })

  it('auto-advances focus on digit entry', async () => {
    render(<OtpForm phone="+77010001122" />)
    const inputs = screen.getAllByRole('textbox')
    await userEvent.type(inputs[0]!, '1')
    await waitFor(() => {
      expect(document.activeElement).toBe(inputs[1])
    })
  })

  it('paste of 6 digits fills all boxes and submits', async () => {
    mockedVerify.mockResolvedValueOnce({
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: '2026-04-22T00:00:00Z',
      refreshTokenExpiresAt: '2026-05-22T00:00:00Z',
      user: { id: 'u-1', role: 'owner', organizationId: 'o-1', name: 'Иван', themeMode: 'system' },
    })
    render(<OtpForm phone="+77010001122" />)
    const inputs = screen.getAllByRole('textbox')
    // Симулируем paste: ставим 6 цифр в первый input
    await userEvent.click(inputs[0]!)
    await userEvent.paste('123456')

    await waitFor(() => {
      expect(mockedVerify).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+77010001122', code: '123456' }),
      )
    })
  })

  it('auto-submits on 6 digits entered', async () => {
    mockedVerify.mockResolvedValueOnce({
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: '2026-04-22T00:00:00Z',
      refreshTokenExpiresAt: '2026-05-22T00:00:00Z',
      user: { id: 'u-1', role: 'owner', organizationId: 'o-1', name: 'Иван', themeMode: 'system' },
    })
    render(<OtpForm phone="+77010001122" />)
    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i++) {
      await userEvent.type(inputs[i]!, String(i + 1))
    }
    await waitFor(() => {
      expect(mockedVerify).toHaveBeenCalledTimes(1)
    })
  })

  it('shows error on INVALID_CODE and clears inputs', async () => {
    mockedVerify.mockRejectedValueOnce(
      new AppError({ code: 'INVALID_CODE', message: 'bad', statusCode: 400 }),
    )
    render(<OtpForm phone="+77010001122" />)
    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i++) {
      await userEvent.type(inputs[i]!, String(i + 1))
    }

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Неверный код/)
    })
    // все боксы пустые после shake
    const after = screen.getAllByRole('textbox') as HTMLInputElement[]
    expect(after.every((i) => i.value === '')).toBe(true)
  })

  it('maps CODE_EXPIRED to expired message', async () => {
    mockedVerify.mockRejectedValueOnce(
      new AppError({ code: 'CODE_EXPIRED', message: 'gone', statusCode: 400 }),
    )
    render(<OtpForm phone="+77010001122" />)
    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i++) await userEvent.type(inputs[i]!, String(i + 1))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Код истёк/)
    })
  })

  it('on success persists session and navigates', async () => {
    mockedVerify.mockResolvedValueOnce({
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: '2026-04-22T00:00:00Z',
      refreshTokenExpiresAt: '2026-05-22T00:00:00Z',
      user: { id: 'u-1', role: 'owner', organizationId: 'o-1', name: 'Иван', themeMode: 'system' },
    })
    render(<OtpForm phone="+77010001122" />)
    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i++) await userEvent.type(inputs[i]!, String(i + 1))

    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe('at')
      expect(pushMock).toHaveBeenCalledWith('/')
    })
  })

  it('redirects to /login when "Изменить номер" clicked', async () => {
    render(<OtpForm phone="+77010001122" />)
    await userEvent.click(screen.getByText(/Изменить номер/))
    expect(pushMock).toHaveBeenCalledWith('/login')
  })
})
