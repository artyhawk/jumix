import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HardHat } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('renders title + icon + description', () => {
    render(
      <EmptyState
        icon={HardHat}
        title="Пока нет крановых"
        description="Добавьте первого кранового"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Пока нет крановых' })).toBeInTheDocument()
    expect(screen.getByText('Добавьте первого кранового')).toBeInTheDocument()
  })

  it('renders action node and fires its handler', async () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        icon={HardHat}
        title="Пусто"
        action={
          <Button onClick={onClick} variant="primary">
            Добавить
          </Button>
        }
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('renders without description when not provided', () => {
    render(<EmptyState icon={HardHat} title="Минимум" />)
    expect(screen.getByText('Минимум')).toBeInTheDocument()
    // описания нет — только heading
    expect(screen.queryByText(/Добавьте/)).toBeNull()
  })

  it('applies custom className wrapper', () => {
    const { container } = render(<EmptyState icon={HardHat} title="t" className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('tone=success uses success/15 glow (brand orange только для neutral)', () => {
    const { container } = render(<EmptyState icon={HardHat} title="t" tone="success" />)
    // Glow div — первый aria-hidden absolute. Проверяем наличие success class.
    const glow = container.querySelector('[aria-hidden].absolute')
    expect(glow?.className).toContain('bg-success/15')
  })
})
