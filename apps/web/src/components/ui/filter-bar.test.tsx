import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FilterBar } from './filter-bar'

describe('FilterBar', () => {
  it('renders search, children, actions slots', () => {
    render(
      <FilterBar
        search={<span data-testid="search">S</span>}
        actions={<button type="button">A</button>}
      >
        <span data-testid="chip">C</span>
      </FilterBar>,
    )
    expect(screen.getByTestId('search')).toBeInTheDocument()
    expect(screen.getByTestId('chip')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
  })

  it('has toolbar role with aria-label', () => {
    render(<FilterBar />)
    const toolbar = screen.getByRole('toolbar', { name: 'Фильтры' })
    expect(toolbar).toBeInTheDocument()
  })

  it('omits search/actions when not provided', () => {
    render(<FilterBar>{null}</FilterBar>)
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })
})
