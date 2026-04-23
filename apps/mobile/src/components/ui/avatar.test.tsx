import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './avatar'

describe('Avatar', () => {
  it('рендерит Image-режим (не инициалы) когда url задан', () => {
    render(<Avatar url="https://cdn.example.com/a.jpg" initials="АЕ" label="Ерлан" />)
    const el = screen.getByLabelText('Ерлан')
    expect(el).toBeInTheDocument()
    // В Image-режиме text-инициалов НЕТ — только image container.
    expect(screen.queryByText('АЕ')).not.toBeInTheDocument()
  })

  it('рендерит инициалы когда url=null', () => {
    render(<Avatar url={null} initials="АЕ" label="Ахметов Ерлан" />)
    expect(screen.getByLabelText('Ахметов Ерлан')).toBeInTheDocument()
    expect(screen.getByText('АЕ')).toBeInTheDocument()
  })

  it('fallback accessibility label когда label не задан', () => {
    render(<Avatar url={null} initials="?" />)
    expect(screen.getByLabelText('Аватар')).toBeInTheDocument()
  })
})
