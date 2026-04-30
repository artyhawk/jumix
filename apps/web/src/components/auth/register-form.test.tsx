import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: pushMock }),
}))

vi.mock('@/lib/api/auth', () => ({
  startRegistration: vi.fn(),
  verifyRegistration: vi.fn(),
}))

import { startRegistration, verifyRegistration } from '@/lib/api/auth'
import { AppError } from '@/lib/api/errors'
import { useAuthStore } from '@/lib/auth-store'
import { RegisterForm } from './register-form'

const mockedStart = vi.mocked(startRegistration)
const mockedVerify = vi.mocked(verifyRegistration)

const VALID_IIN = '900101300007'

async function pastePhone(input: HTMLElement, digits: string) {
  await userEvent.click(input)
  await userEvent.paste(digits)
}

async function fillProfile() {
  await userEvent.type(screen.getByLabelText(/Фамилия/), 'Иванов')
  await userEvent.type(screen.getByLabelText(/Имя$/), 'Иван')
  await userEvent.type(screen.getByLabelText(/ИИН/), VALID_IIN)
  await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
}

beforeEach(() => {
  pushMock.mockReset()
  mockedStart.mockReset()
  mockedVerify.mockReset()
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

describe('RegisterForm', () => {
  it('renders profile-step fields', () => {
    render(<RegisterForm />)
    expect(screen.getByLabelText(/Фамилия/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Имя$/)).toBeInTheDocument()
    expect(screen.getByLabelText(/ИИН/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Номер телефона/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Получить код/ })).toBeInTheDocument()
  })

  it('shows error and skips API call when fields empty', async () => {
    render(<RegisterForm />)
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))
    expect(mockedStart).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('rejects invalid-checksum IIN', async () => {
    render(<RegisterForm />)
    await userEvent.type(screen.getByLabelText(/Фамилия/), 'Иванов')
    await userEvent.type(screen.getByLabelText(/Имя$/), 'Иван')
    await userEvent.type(screen.getByLabelText(/ИИН/), '123456789012')
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))

    expect(mockedStart).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/12-значный ИИН/)
    })
  })

  it('on valid profile transitions to OTP step', async () => {
    mockedStart.mockResolvedValueOnce({ expiresIn: 600 })
    render(<RegisterForm />)
    await fillProfile()
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))

    await waitFor(() => {
      expect(mockedStart).toHaveBeenCalledWith('+77010001122')
    })
    expect(screen.getByText(/Мы отправили 6-значный код/)).toBeInTheDocument()
  })

  it('OTP submit calls verifyRegistration with full payload, persists session and redirects to /me', async () => {
    mockedStart.mockResolvedValueOnce({ expiresIn: 600 })
    mockedVerify.mockResolvedValueOnce({
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: '2026-04-22T00:00:00Z',
      refreshTokenExpiresAt: '2026-05-22T00:00:00Z',
      user: {
        id: 'u-1',
        role: 'operator',
        organizationId: null,
        name: 'Иван',
        themeMode: 'system',
      },
    })

    render(<RegisterForm />)
    await fillProfile()
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))
    // Wait for OTP step
    const slot0 = await screen.findByLabelText('Цифра 1')
    await userEvent.click(slot0)
    await userEvent.paste('123456')

    await waitFor(() => {
      expect(mockedVerify).toHaveBeenCalledWith({
        phone: '+77010001122',
        otp: '123456',
        firstName: 'Иван',
        lastName: 'Иванов',
        patronymic: null,
        iin: VALID_IIN,
        clientKind: 'web',
      })
      expect(useAuthStore.getState().user?.role).toBe('operator')
      expect(pushMock).toHaveBeenCalledWith('/me')
    })
  })

  it('sends user back to profile step on PHONE_ALREADY_REGISTERED', async () => {
    mockedStart.mockResolvedValueOnce({ expiresIn: 600 })
    mockedVerify.mockRejectedValueOnce(
      new AppError({
        code: 'PHONE_ALREADY_REGISTERED',
        message: 'taken',
        statusCode: 409,
      }),
    )

    render(<RegisterForm />)
    await fillProfile()
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))
    const slot0 = await screen.findByLabelText('Цифра 1')
    await userEvent.click(slot0)
    await userEvent.paste('123456')

    await waitFor(() => {
      // Back on profile step
      expect(screen.getByLabelText(/Фамилия/)).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent(/уже зарегистрирован/)
    })
  })

  it('on rate limit shows specific message and stays on profile step', async () => {
    mockedStart.mockRejectedValueOnce(
      new AppError({ code: 'RATE_LIMITED', message: 'rate', statusCode: 429 }),
    )
    render(<RegisterForm />)
    await fillProfile()
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Слишком много попыток/)
    })
    expect(screen.getByLabelText(/Фамилия/)).toBeInTheDocument()
  })
})
