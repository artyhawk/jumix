import { MarketingLocaleProvider } from '@/lib/marketing-locale'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { LocaleSwitcher } from './locale-switcher'

afterEach(() => {
  window.localStorage.clear()
})

function renderWithProvider() {
  return render(
    <MarketingLocaleProvider>
      <LocaleSwitcher />
    </MarketingLocaleProvider>,
  )
}

describe('LocaleSwitcher', () => {
  it('renders trigger с текущей locale (по умолчанию RU)', () => {
    renderWithProvider()
    const trigger = screen.getByRole('button', { name: /Язык: Русский/i })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent('RU')
  })

  it('opens dropdown с тремя options ru/kz/en', async () => {
    renderWithProvider()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Язык/i }))
    expect(screen.getByRole('menuitem', { name: /Русский/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Қазақша/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /English/i })).toBeInTheDocument()
  })

  it('switches locale on click + persists to localStorage', async () => {
    renderWithProvider()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Язык/i }))
    await user.click(screen.getByRole('menuitem', { name: /English/i }))
    expect(window.localStorage.getItem('jumix-marketing-locale')).toBe('en')
    // Trigger aria-label updates to новой locale
    expect(await screen.findByLabelText(/Язык: English/i)).toBeInTheDocument()
  })

  it('hydrates from localStorage on mount', async () => {
    window.localStorage.setItem('jumix-marketing-locale', 'kz')
    renderWithProvider()
    expect(await screen.findByRole('button', { name: /Язык: Қазақша/i })).toHaveTextContent('KZ')
  })

  it('ignores invalid persisted values (fallback to ru)', () => {
    window.localStorage.setItem('jumix-marketing-locale', 'fr')
    renderWithProvider()
    expect(screen.getByRole('button', { name: /Язык: Русский/i })).toHaveTextContent('RU')
  })
})
