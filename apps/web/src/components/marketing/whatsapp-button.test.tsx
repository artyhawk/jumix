import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { whatsappLink } from './whatsapp'
import { WhatsAppButton } from './whatsapp-button'

describe('whatsappLink', () => {
  it('builds wa.me URL with default message URL-encoded', () => {
    const url = whatsappLink()
    expect(url).toMatch(/^https:\/\/wa\.me\/77022244428\?text=/)
    expect(url).toContain(encodeURIComponent('Здравствуйте, интересует Jumix'))
  })

  it('encodes custom message', () => {
    const url = whatsappLink('Привет, Мир!')
    expect(url).toContain(encodeURIComponent('Привет, Мир!'))
  })
})

describe('WhatsAppButton', () => {
  it('renders link to wa.me with target=_blank + noopener', () => {
    render(<WhatsAppButton>Связаться</WhatsAppButton>)
    const link = screen.getByTestId('whatsapp-button')
    expect(link).toHaveAttribute('href', expect.stringContaining('wa.me/77022244428'))
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })

  it('renders custom children label', () => {
    render(<WhatsAppButton>Связаться сейчас</WhatsAppButton>)
    expect(screen.getByText('Связаться сейчас')).toBeInTheDocument()
  })

  it('uses default CTA label when no children passed', () => {
    render(<WhatsAppButton />)
    expect(screen.getByTestId('whatsapp-button')).toHaveTextContent('Связаться в WhatsApp')
  })
})
