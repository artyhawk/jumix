import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: pushMock }),
}))

vi.mock('@/lib/api/auth', () => ({
  requestSmsCode: vi.fn(),
  passwordLogin: vi.fn(),
}))

import { passwordLogin, requestSmsCode } from '@/lib/api/auth'
import { AppError } from '@/lib/api/errors'
import { useAuthStore } from '@/lib/auth-store'
import { LoginForm } from './login-form'

const mockedRequest = vi.mocked(requestSmsCode)
const mockedLogin = vi.mocked(passwordLogin)

// userEvent.type конфликтует с masked-controlled input (state-mutation на каждом keystroke
// меняет value, что сбивает позицию каретки). Для надёжности используем paste — он
// триггерит один input event со всеми цифрами, маска корректно отрабатывает за один цикл.
async function pastePhone(input: HTMLElement, digits: string) {
  await userEvent.click(input)
  await userEvent.paste(digits)
}

beforeEach(() => {
  pushMock.mockReset()
  mockedRequest.mockReset()
  mockedLogin.mockReset()
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

describe('LoginForm', () => {
  it('disables submit until phone is 10 digits', async () => {
    render(<LoginForm />)
    const submit = screen.getByRole('button', { name: /Получить код/ })
    expect(submit).toBeDisabled()

    const phone = screen.getByLabelText(/Номер телефона/)
    await pastePhone(phone, '7010001122')
    expect(submit).not.toBeDisabled()
  })

  it('formats phone via paste mask', async () => {
    render(<LoginForm />)
    const phone = screen.getByLabelText(/Номер телефона/) as HTMLInputElement
    await pastePhone(phone, '7010001122')
    expect(phone.value).toBe('+7 701 000 11 22')
  })

  it('calls requestSmsCode and navigates to verify on SMS submit', async () => {
    mockedRequest.mockResolvedValueOnce({ ok: true })
    render(<LoginForm />)
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))

    await waitFor(() => {
      expect(mockedRequest).toHaveBeenCalledWith('+77010001122')
      expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('/login/verify?phone='))
    })
  })

  it('toggles to password mode and back', async () => {
    render(<LoginForm />)
    expect(screen.queryByLabelText(/Пароль/)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /Войти по паролю/ }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Пароль/)).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /Войти по SMS/ }))
    await waitFor(() => {
      expect(screen.queryByLabelText(/Пароль/)).toBeNull()
    })
  })

  it('shows specific error for INVALID_CREDENTIALS', async () => {
    mockedLogin.mockRejectedValueOnce(
      new AppError({
        code: 'INVALID_CREDENTIALS',
        message: 'invalid',
        statusCode: 401,
      }),
    )
    render(<LoginForm />)
    await userEvent.click(screen.getByRole('button', { name: /Войти по паролю/ }))
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    const passwordInput = await screen.findByLabelText(/Пароль/)
    await userEvent.type(passwordInput, 'secret123')
    await userEvent.click(screen.getByRole('button', { name: /^Войти$/ }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Неверный номер или пароль/)
    })
  })

  it('shows specific error for ACCOUNT_LOCKED', async () => {
    mockedLogin.mockRejectedValueOnce(
      new AppError({ code: 'ACCOUNT_LOCKED', message: 'locked', statusCode: 429 }),
    )
    render(<LoginForm />)
    await userEvent.click(screen.getByRole('button', { name: /Войти по паролю/ }))
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    const passwordInput = await screen.findByLabelText(/Пароль/)
    await userEvent.type(passwordInput, 'secret123')
    await userEvent.click(screen.getByRole('button', { name: /^Войти$/ }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Аккаунт временно заблокирован/)
    })
  })

  it('on successful password login persists session', async () => {
    mockedLogin.mockResolvedValueOnce({
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: '2026-04-22T00:00:00Z',
      refreshTokenExpiresAt: '2026-05-22T00:00:00Z',
      user: { id: 'u-1', role: 'owner', organizationId: 'o-1', name: 'Иван' },
    })
    render(<LoginForm />)
    await userEvent.click(screen.getByRole('button', { name: /Войти по паролю/ }))
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    const passwordInput = await screen.findByLabelText(/Пароль/)
    await userEvent.type(passwordInput, 'secret')
    await userEvent.click(screen.getByRole('button', { name: /^Войти$/ }))

    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe('at')
      expect(useAuthStore.getState().user?.name).toBe('Иван')
      expect(pushMock).toHaveBeenCalledWith('/')
    })
  })
})
