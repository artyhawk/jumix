import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Textarea } from './textarea'

describe('Textarea', () => {
  it('renders with placeholder', () => {
    render(<Textarea placeholder="Причина" />)
    expect(screen.getByPlaceholderText('Причина')).toBeInTheDocument()
  })

  it('calls onChange', async () => {
    const handler = vi.fn()
    render(<Textarea onChange={handler} />)
    await userEvent.type(screen.getByRole('textbox'), 'hi')
    expect(handler).toHaveBeenCalled()
  })

  it('applies aria-invalid when invalid prop is set', () => {
    render(<Textarea invalid />)
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('respects maxLength', async () => {
    render(<Textarea maxLength={3} />)
    const el = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(el, 'abcdef')
    expect(el.value).toBe('abc')
  })

  it('renders disabled state', () => {
    render(<Textarea disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })
})
