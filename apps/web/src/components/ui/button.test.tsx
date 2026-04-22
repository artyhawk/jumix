import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('handles onClick', async () => {
    const handler = vi.fn()
    render(<Button onClick={handler}>Go</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop', async () => {
    const handler = vi.fn()
    render(
      <Button onClick={handler} disabled>
        Off
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    await userEvent.click(btn)
    expect(handler).not.toHaveBeenCalled()
  })

  it('applies min-h-[44px] for mobile touch target', () => {
    render(<Button>Tap</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toMatch(/min-h-\[44px\]/)
  })

  it('shows loading state and blocks clicks', async () => {
    const handler = vi.fn()
    render(
      <Button loading onClick={handler}>
        Save
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(btn).toBeDisabled()
    await userEvent.click(btn)
    expect(handler).not.toHaveBeenCalled()
  })

  it('supports block variant for full width', () => {
    render(<Button block>Full</Button>)
    expect(screen.getByRole('button').className).toMatch(/w-full/)
  })

  it('renders primary variant with brand bg', () => {
    render(<Button variant="primary">P</Button>)
    expect(screen.getByRole('button').className).toMatch(/bg-brand-500/)
  })

  it('renders danger variant with danger bg', () => {
    render(<Button variant="danger">D</Button>)
    expect(screen.getByRole('button').className).toMatch(/bg-danger/)
  })
})
