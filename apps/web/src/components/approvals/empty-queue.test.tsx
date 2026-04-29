import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyQueue } from './empty-queue'

describe('EmptyQueue', () => {
  it('renders crane-profiles variant', () => {
    render(<EmptyQueue type="crane-profiles" />)
    expect(screen.getByText('Нет заявок крановых')).toBeInTheDocument()
    expect(screen.getByText('Новые регистрации появятся здесь')).toBeInTheDocument()
  })

  it('renders hires variant', () => {
    render(<EmptyQueue type="hires" />)
    expect(screen.getByText('Нет запросов найма')).toBeInTheDocument()
    expect(screen.getByText('Компании пока никого не нанимают')).toBeInTheDocument()
  })

  it('renders cranes variant', () => {
    render(<EmptyQueue type="cranes" />)
    expect(screen.getByText('Нет заявок на краны')).toBeInTheDocument()
    expect(screen.getByText('Добавленные компаниями краны появятся здесь')).toBeInTheDocument()
  })
})
