import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FilterChip } from './filter-chip'

type Status = 'pending' | 'approved' | 'rejected'

const options = [
  { value: 'pending' as Status, label: 'Ожидают' },
  { value: 'approved' as Status, label: 'Одобрены' },
  { value: 'rejected' as Status, label: 'Отклонены' },
]

describe('FilterChip', () => {
  it('renders label when value is null', () => {
    render(<FilterChip<Status> label="Статус" value={null} options={options} onChange={() => {}} />)
    expect(screen.getByLabelText('Фильтр: Статус')).toBeInTheDocument()
    expect(screen.getByText('Статус')).toBeInTheDocument()
  })

  it('shows selected option label when value is set', () => {
    render(
      <FilterChip<Status> label="Статус" value="approved" options={options} onChange={() => {}} />,
    )
    expect(screen.getByText('Одобрены')).toBeInTheDocument()
  })

  it('shows clear button when active and calls onChange(null)', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(
      <FilterChip<Status> label="Статус" value="pending" options={options} onChange={handler} />,
    )
    const clearBtn = screen.getByLabelText('Очистить фильтр: Статус')
    await user.click(clearBtn)
    expect(handler).toHaveBeenCalledWith(null)
  })

  it('hides clear button when value is null', () => {
    render(<FilterChip<Status> label="Статус" value={null} options={options} onChange={() => {}} />)
    expect(screen.queryByLabelText('Очистить фильтр: Статус')).not.toBeInTheDocument()
  })

  it('opens dropdown on trigger click and selects option', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(<FilterChip<Status> label="Статус" value={null} options={options} onChange={handler} />)
    await user.click(screen.getByLabelText('Фильтр: Статус'))
    const approved = await screen.findByText('Одобрены')
    await user.click(approved)
    expect(handler).toHaveBeenCalledWith('approved')
  })

  it('resets via "Все" item in dropdown', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(
      <FilterChip<Status>
        label="Статус"
        value="approved"
        options={options}
        onChange={handler}
        allLabel="Любой"
      />,
    )
    await user.click(screen.getByLabelText('Фильтр: Статус'))
    const allItem = await screen.findByText('Любой')
    await user.click(allItem)
    expect(handler).toHaveBeenCalledWith(null)
  })
})
