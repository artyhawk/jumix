import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PrivacyPage from './page'

describe('PrivacyPage', () => {
  it('renders title and last-updated date', () => {
    render(<PrivacyPage />)
    expect(
      screen.getByRole('heading', { name: /политика конфиденциальности/i, level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByText(/действует с 17 апреля 2026 года/i)).toBeInTheDocument()
  })

  it('renders all 7 sections + contacts', () => {
    render(<PrivacyPage />)
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.length).toBeGreaterThanOrEqual(8)
  })

  it('includes legal-review notice', () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/требует юридической редактуры/i)).toBeInTheDocument()
  })

  it('renders back link to /', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('link', { name: /на главную/i })).toHaveAttribute('href', '/')
  })
})
