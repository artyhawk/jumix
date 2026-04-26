import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoginLink } from './login-link'

describe('LoginLink', () => {
  it('renders link to /login', () => {
    render(<LoginLink />)
    const link = screen.getByTestId('login-link')
    expect(link).toHaveAttribute('href', '/login')
  })

  it('uses default label "Войти"', () => {
    render(<LoginLink />)
    expect(screen.getByTestId('login-link')).toHaveTextContent('Войти')
  })

  it('renders custom label', () => {
    render(<LoginLink label="В кабинет" />)
    expect(screen.getByTestId('login-link')).toHaveTextContent('В кабинет')
  })
})
