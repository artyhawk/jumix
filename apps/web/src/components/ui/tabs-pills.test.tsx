import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TabsPills } from './tabs-pills'

const tabs = [
  { value: 'a', label: 'Aaa', badge: 3 },
  { value: 'b', label: 'Bbb', badge: 0 },
  { value: 'c', label: 'Ccc' },
]

describe('TabsPills', () => {
  it('renders all tabs with labels', () => {
    render(<TabsPills value="a" onValueChange={() => {}} tabs={tabs} />)
    expect(screen.getByRole('tab', { name: /Aaa/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Bbb/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Ccc/ })).toBeInTheDocument()
  })

  it('marks active tab with data-state=active', () => {
    render(<TabsPills value="b" onValueChange={() => {}} tabs={tabs} />)
    const active = screen.getByRole('tab', { name: /Bbb/ })
    expect(active).toHaveAttribute('data-state', 'active')
  })

  it('calls onValueChange on click', async () => {
    const handler = vi.fn()
    render(<TabsPills value="a" onValueChange={handler} tabs={tabs} />)
    await userEvent.click(screen.getByRole('tab', { name: /Bbb/ }))
    expect(handler).toHaveBeenCalledWith('b')
  })

  it('renders positive badge count', () => {
    render(<TabsPills value="a" onValueChange={() => {}} tabs={tabs} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders zero badge as dim 0', () => {
    render(<TabsPills value="a" onValueChange={() => {}} tabs={tabs} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('does not render badge when undefined', () => {
    render(<TabsPills value="a" onValueChange={() => {}} tabs={[{ value: 'x', label: 'X' }]} />)
    // no numeric text content
    expect(screen.queryByText(/^\d+$/)).toBeNull()
  })
})
