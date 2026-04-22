import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DataTable, type DataTableColumn } from './data-table'

interface Row {
  id: string
  name: string
  count: number
}

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Название', cell: (r) => r.name },
  { key: 'count', header: 'Счёт', cell: (r) => r.count, align: 'right' },
]

const rows: Row[] = [
  { id: '1', name: 'Alpha', count: 1 },
  { id: '2', name: 'Beta', count: 2 },
]

describe('DataTable', () => {
  it('renders headers and cells on desktop table', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />)
    // headers present (rendered in both desktop table <th> and mobile <dt>)
    expect(screen.getAllByText('Название').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Счёт').length).toBeGreaterThan(0)
    // values
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Beta').length).toBeGreaterThan(0)
  })

  it('onRowClick fires when row clicked', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={handler} />)
    // Click the first matching "Alpha" node (table row; mobile button hidden via CSS but still in DOM)
    const cells = screen.getAllByText('Alpha')
    const first = cells[0]
    if (!first) throw new Error('no Alpha cell')
    await user.click(first)
    expect(handler).toHaveBeenCalledWith(rows[0])
  })

  it('shows empty state when rows empty and not loading', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} empty={<div>Пусто</div>} />)
    expect(screen.getByText('Пусто')).toBeInTheDocument()
  })

  it('shows skeleton when loading', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading />)
    // skeletons have role=status
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })

  it('renders Load more button when hasMore', async () => {
    const user = userEvent.setup()
    const loadMore = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        hasMore
        onLoadMore={loadMore}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Загрузить ещё' })
    await user.click(btn)
    expect(loadMore).toHaveBeenCalled()
  })

  it('disables Load more button while loadingMore', () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        hasMore
        loadingMore
        onLoadMore={() => {}}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Загрузка…' })
    expect(btn).toBeDisabled()
  })

  it('hides Load more button when hasMore is false', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />)
    expect(screen.queryByRole('button', { name: 'Загрузить ещё' })).not.toBeInTheDocument()
  })
})
