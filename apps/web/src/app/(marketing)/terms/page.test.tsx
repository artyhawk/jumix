import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TermsPage from './page'

describe('TermsPage', () => {
  it('renders title', () => {
    render(<TermsPage />)
    expect(
      screen.getByRole('heading', { name: /пользовательское соглашение/i, level: 1 }),
    ).toBeInTheDocument()
  })

  it('renders 7 numbered sections + contacts', () => {
    render(<TermsPage />)
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.length).toBeGreaterThanOrEqual(8)
  })

  it('includes legal-review notice', () => {
    render(<TermsPage />)
    expect(screen.getByText(/требует юридической редактуры/i)).toBeInTheDocument()
  })
})
