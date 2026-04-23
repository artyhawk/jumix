import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './badge'

describe('Badge', () => {
  it('рендерит label', () => {
    render(<Badge variant="approved" label="Одобрено" />)
    expect(screen.getByText('Одобрено')).toBeInTheDocument()
  })

  it('все semantic variants рендерятся без ошибки', () => {
    const variants = [
      'approved',
      'pending',
      'rejected',
      'active',
      'blocked',
      'terminated',
      'expired',
      'expiring',
      'valid',
      'neutral',
    ] as const
    for (const v of variants) {
      const { unmount } = render(<Badge variant={v} label={v} />)
      expect(screen.getByText(v)).toBeInTheDocument()
      unmount()
    }
  })
})
