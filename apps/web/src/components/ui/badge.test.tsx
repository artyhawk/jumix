import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge, type BadgeVariant } from './badge'

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Hello</Badge>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  const variants: Array<{ v: BadgeVariant; cls: RegExp }> = [
    { v: 'pending', cls: /text-warning/ },
    { v: 'approved', cls: /text-success/ },
    { v: 'rejected', cls: /text-danger/ },
    { v: 'active', cls: /text-success/ },
    { v: 'blocked', cls: /text-danger/ },
    { v: 'terminated', cls: /text-text-tertiary/ },
    { v: 'expired', cls: /text-danger/ },
    { v: 'expiring', cls: /text-warning/ },
    { v: 'neutral', cls: /text-text-secondary/ },
  ]

  for (const { v, cls } of variants) {
    it(`variant=${v} applies correct text color`, () => {
      const { container } = render(<Badge variant={v}>X</Badge>)
      const span = container.querySelector('span')!
      expect(span.className).toMatch(cls)
    })
  }

  it('warning variants render alert icon (not dot)', () => {
    const { container } = render(<Badge variant="expiring">Warn</Badge>)
    // svg от lucide AlertTriangle
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('non-warning variants render dot when withDot=true (default)', () => {
    const { container } = render(<Badge variant="approved">Ok</Badge>)
    expect(container.querySelector('svg')).toBeFalsy()
    // dot — span с rounded-full
    expect(container.querySelector('.rounded-full')).toBeTruthy()
  })

  it('hides dot when withDot=false', () => {
    const { container } = render(
      <Badge variant="approved" withDot={false}>
        Plain
      </Badge>,
    )
    expect(container.querySelector('.rounded-full')).toBeFalsy()
  })
})
