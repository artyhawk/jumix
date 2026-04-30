import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/lib/api/auth', () => ({
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}))

import { confirmPasswordReset, requestPasswordReset } from '@/lib/api/auth'
import { AppError } from '@/lib/api/errors'
import { ForgotPasswordForm } from './forgot-password-form'

const mockedRequest = vi.mocked(requestPasswordReset)
const mockedConfirm = vi.mocked(confirmPasswordReset)

async function pastePhone(input: HTMLElement, digits: string) {
  await userEvent.click(input)
  await userEvent.paste(digits)
}

beforeEach(() => {
  mockedRequest.mockReset()
  mockedConfirm.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ForgotPasswordForm', () => {
  it('renders phone-step initially', () => {
    render(<ForgotPasswordForm />)
    expect(screen.getByLabelText(/Номер телефона/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Получить код/ })).toBeDisabled()
  })

  it('enables submit only after 10-digit phone is entered', async () => {
    render(<ForgotPasswordForm />)
    const submit = screen.getByRole('button', { name: /Получить код/ })
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    expect(submit).not.toBeDisabled()
  })

  it('moves to reset step after successful request', async () => {
    mockedRequest.mockResolvedValueOnce({ ok: true })
    render(<ForgotPasswordForm />)
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))

    await waitFor(() => {
      expect(mockedRequest).toHaveBeenCalledWith('+77010001122')
      expect(screen.getByLabelText(/Новый пароль/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Повторите пароль/)).toBeInTheDocument()
    })
  })

  it('rejects mismatched passwords without API call', async () => {
    mockedRequest.mockResolvedValueOnce({ ok: true })
    render(<ForgotPasswordForm />)
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))

    await screen.findByLabelText(/Новый пароль/)
    const slot0 = screen.getByLabelText('Цифра 1')
    await userEvent.click(slot0)
    await userEvent.paste('123456')
    await userEvent.type(screen.getByLabelText(/Новый пароль/), 'abcdefghij')
    await userEvent.type(screen.getByLabelText(/Повторите пароль/), 'different00')
    await userEvent.click(screen.getByRole('button', { name: /Сменить пароль/ }))

    expect(mockedConfirm).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/не совпадают/)
    })
  })

  it('rejects too-short password without API call', async () => {
    mockedRequest.mockResolvedValueOnce({ ok: true })
    render(<ForgotPasswordForm />)
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))

    await screen.findByLabelText(/Новый пароль/)
    const slot0 = screen.getByLabelText('Цифра 1')
    await userEvent.click(slot0)
    await userEvent.paste('123456')
    await userEvent.type(screen.getByLabelText(/Новый пароль/), 'short')
    await userEvent.type(screen.getByLabelText(/Повторите пароль/), 'short')
    await userEvent.click(screen.getByRole('button', { name: /Сменить пароль/ }))

    expect(mockedConfirm).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/не короче 10/)
    })
  })

  it('on successful confirm shows success step with link to /login', async () => {
    mockedRequest.mockResolvedValueOnce({ ok: true })
    mockedConfirm.mockResolvedValueOnce({ ok: true })
    render(<ForgotPasswordForm />)
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))

    await screen.findByLabelText(/Новый пароль/)
    const slot0 = screen.getByLabelText('Цифра 1')
    await userEvent.click(slot0)
    await userEvent.paste('123456')
    await userEvent.type(screen.getByLabelText(/Новый пароль/), 'secret-pass-99')
    await userEvent.type(screen.getByLabelText(/Повторите пароль/), 'secret-pass-99')
    await userEvent.click(screen.getByRole('button', { name: /Сменить пароль/ }))

    await waitFor(() => {
      expect(mockedConfirm).toHaveBeenCalledWith({
        phone: '+77010001122',
        code: '123456',
        newPassword: 'secret-pass-99',
      })
      expect(screen.getByText(/Пароль изменён/)).toBeInTheDocument()
    })
    const goToLogin = screen.getByRole('link', { name: /Перейти ко входу/ })
    expect(goToLogin).toHaveAttribute('href', '/login')
  })

  it('shows specific message on PASSWORD_RESET_INVALID', async () => {
    mockedRequest.mockResolvedValueOnce({ ok: true })
    mockedConfirm.mockRejectedValueOnce(
      new AppError({ code: 'PASSWORD_RESET_INVALID', message: 'bad', statusCode: 400 }),
    )
    render(<ForgotPasswordForm />)
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))

    await screen.findByLabelText(/Новый пароль/)
    const slot0 = screen.getByLabelText('Цифра 1')
    await userEvent.click(slot0)
    await userEvent.paste('123456')
    await userEvent.type(screen.getByLabelText(/Новый пароль/), 'secret-pass-99')
    await userEvent.type(screen.getByLabelText(/Повторите пароль/), 'secret-pass-99')
    await userEvent.click(screen.getByRole('button', { name: /Сменить пароль/ }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Неверный или просроченный код/)
    })
  })

  it('shows rate limit message on RATE_LIMITED at request', async () => {
    mockedRequest.mockRejectedValueOnce(
      new AppError({ code: 'RATE_LIMITED', message: 'rate', statusCode: 429 }),
    )
    render(<ForgotPasswordForm />)
    await pastePhone(screen.getByLabelText(/Номер телефона/), '7010001122')
    await userEvent.click(screen.getByRole('button', { name: /Получить код/ }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Слишком много попыток/)
    })
    expect(screen.getByLabelText(/Номер телефона/)).toBeInTheDocument()
  })
})
