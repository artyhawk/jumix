import { ApiError, NetworkError } from '@/lib/api/errors'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MeScreenError } from './me-screen-error'

describe('MeScreenError', () => {
  it('NetworkError → offline сообщение', () => {
    render(<MeScreenError error={new NetworkError()} onRetry={() => {}} />)
    expect(screen.getByText('Нет соединения')).toBeInTheDocument()
    expect(
      screen.getByText('Проверьте интернет-соединение и попробуйте ещё раз.'),
    ).toBeInTheDocument()
  })

  it('ApiError → server message', () => {
    render(
      <MeScreenError
        error={new ApiError('PROFILE_NOT_FOUND', 'Профиль не найден', 404)}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByText('Не удалось загрузить данные')).toBeInTheDocument()
    expect(screen.getByText('Профиль не найден')).toBeInTheDocument()
  })

  it('unknown error → generic fallback', () => {
    render(<MeScreenError error={new Error('weird')} onRetry={() => {}} />)
    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument()
  })

  it('Повторить клик → onRetry', () => {
    const onRetry = vi.fn()
    render(<MeScreenError error={new NetworkError()} onRetry={onRetry} />)
    fireEvent.click(screen.getByText('Повторить'))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
