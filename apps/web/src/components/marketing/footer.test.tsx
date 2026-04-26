import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from './footer'

describe('Footer', () => {
  it('renders tagline', () => {
    render(<Footer />)
    expect(screen.getByText(/цифровая платформа для крановых услуг/i)).toBeInTheDocument()
  })

  it('renders contacts: phone tel link, WhatsApp link, email', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: /\+7 702 224 44 28/i })).toHaveAttribute(
      'href',
      'tel:+77022244428',
    )
    const whatsapp = screen.getByRole('link', { name: 'WhatsApp' })
    expect(whatsapp).toHaveAttribute('href', expect.stringContaining('wa.me/77022244428'))
    expect(whatsapp).toHaveAttribute('target', '_blank')

    const email = screen.getByRole('link', { name: /info@jumix\.kz/i })
    expect(email).toHaveAttribute('href', 'mailto:info@jumix.kz')
  })

  it('renders legal links to /privacy and /terms', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: /политика конфиденциальности/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(screen.getByRole('link', { name: /пользовательское соглашение/i })).toHaveAttribute(
      'href',
      '/terms',
    )
    expect(screen.getByRole('link', { name: /войти в кабинет/i })).toHaveAttribute('href', '/login')
  })

  it('renders copyright with year 2026', () => {
    render(<Footer />)
    expect(screen.getByText(/2026/)).toBeInTheDocument()
  })
})
