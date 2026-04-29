import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Header } from './header'

const mockPathname = vi.fn<() => string>()
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}))

describe('Header', () => {
  it('renders Jumix wordmark linked to /', () => {
    mockPathname.mockReturnValue('/')
    render(<Header />)
    expect(screen.getByRole('link', { name: 'Jumix' })).toHaveAttribute('href', '/')
  })

  it('renders WhatsApp CTA + login link', () => {
    mockPathname.mockReturnValue('/')
    render(<Header />)
    expect(screen.getByTestId('whatsapp-button')).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/77022244428'),
    )
    expect(screen.getByTestId('login-link')).toHaveAttribute('href', '/login')
  })

  it('renders desktop nav anchors к sections на главной', () => {
    mockPathname.mockReturnValue('/')
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

  it('скрывает якорные ссылки на не-главных страницах (privacy/terms)', () => {
    mockPathname.mockReturnValue('/privacy')
    render(<Header />)
    expect(screen.queryByRole('link', { name: 'Возможности' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Крановым' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Как это работает' })).not.toBeInTheDocument()
  })
})
