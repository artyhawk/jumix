import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Header } from './header'

describe('Header', () => {
  it('renders Jumix wordmark linked to /', () => {
    render(<Header />)
    expect(screen.getByRole('link', { name: 'Jumix' })).toHaveAttribute('href', '/')
  })

  it('renders WhatsApp CTA + login link', () => {
    render(<Header />)
    expect(screen.getByTestId('whatsapp-button')).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/77022244428'),
    )
    expect(screen.getByTestId('login-link')).toHaveAttribute('href', '/login')
  })

  it('renders desktop nav anchors к sections', () => {
    render(<Header />)
    expect(screen.getByRole('link', { name: 'Возможности' })).toHaveAttribute(
      'href',
      '#for-companies',
    )
    expect(screen.getByRole('link', { name: 'Крановым' })).toHaveAttribute('href', '#for-operators')
    expect(screen.getByRole('link', { name: 'Как это работает' })).toHaveAttribute(
      'href',
      '#how-it-works',
    )
  })
})
