import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Input } from './input'

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Hello" />)
    expect(screen.getByPlaceholderText('Hello')).toBeInTheDocument()
  })

  it('calls onChange', async () => {
    const handler = vi.fn()
    render(<Input onChange={handler} />)
    await userEvent.type(screen.getByRole('textbox'), 'abc')
    expect(handler).toHaveBeenCalled()
  })

  it('applies aria-invalid when invalid prop', () => {
    render(<Input invalid />)
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('passes inputMode through', () => {
    render(<Input inputMode="numeric" />)
    expect(screen.getByRole('textbox')).toHaveAttribute('inputmode', 'numeric')
  })

  it('min-h-[44px] for mobile touch target', () => {
    render(<Input />)
    expect(screen.getByRole('textbox').className).toMatch(/min-h-\[44px\]/)
  })
})
