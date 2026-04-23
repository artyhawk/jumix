import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './error-boundary'

describe('ErrorBoundary', () => {
  it('renders default title + description + icon', () => {
    const error = new Error('boom')
    render(<ErrorBoundary error={error} reset={() => {}} />)
    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument()
    expect(
      screen.getByText('Попробуйте обновить страницу или вернитесь позже.'),
    ).toBeInTheDocument()
  })

  it('renders custom title + description overrides', () => {
    const error = new Error('boom')
    render(
      <ErrorBoundary
        error={error}
        reset={() => {}}
        title="Сервер недоступен"
        description="Повторите через минуту"
      />,
    )
    expect(screen.getByText('Сервер недоступен')).toBeInTheDocument()
    expect(screen.getByText('Повторите через минуту')).toBeInTheDocument()
  })

  it('fires reset when button clicked', async () => {
    const error = new Error('boom')
    const reset = vi.fn()
    render(<ErrorBoundary error={error} reset={reset} />)
    await userEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    expect(reset).toHaveBeenCalled()
  })

  it('shows digest when present', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' })
    render(<ErrorBoundary error={error} reset={() => {}} />)
    expect(screen.getByText('ID: abc123')).toBeInTheDocument()
  })

  it('hides digest line when absent', () => {
    const error = new Error('boom')
    render(<ErrorBoundary error={error} reset={() => {}} />)
    expect(screen.queryByText(/^ID:/)).toBeNull()
  })
})
