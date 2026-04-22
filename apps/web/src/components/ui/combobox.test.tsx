import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Combobox } from './combobox'

type Org = string

const options = [
  { value: 'org-1' as Org, label: 'Telse', hint: '001' },
  { value: 'org-2' as Org, label: 'Almaty Crane', hint: '002' },
  { value: 'org-3' as Org, label: 'ShymkentBuild', hint: '003' },
]

describe('Combobox', () => {
  it('renders placeholder when no value', () => {
    render(
      <Combobox<Org>
        value={null}
        onChange={() => {}}
        options={options}
        placeholder="Выбрать организацию"
        ariaLabel="Организация"
      />,
    )
    expect(screen.getByLabelText('Организация')).toBeInTheDocument()
    expect(screen.getByText('Выбрать организацию')).toBeInTheDocument()
  })

  it('shows selected option label', () => {
    render(
      <Combobox<Org> value="org-2" onChange={() => {}} options={options} ariaLabel="Организация" />,
    )
    expect(screen.getByText('Almaty Crane')).toBeInTheDocument()
  })

  it('opens popover and selects option by click', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(
      <Combobox<Org> value={null} onChange={handler} options={options} ariaLabel="Организация" />,
    )
    await user.click(screen.getByLabelText('Организация'))
    const option = await screen.findByText('ShymkentBuild')
    await user.click(option)
    expect(handler).toHaveBeenCalledWith('org-3')
  })

  it('clear button resets value', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(
      <Combobox<Org> value="org-1" onChange={handler} options={options} ariaLabel="Организация" />,
    )
    await user.click(screen.getByLabelText('Очистить: Организация'))
    expect(handler).toHaveBeenCalledWith(null)
  })

  it('filters options by search (local mode)', async () => {
    const user = userEvent.setup()
    render(
      <Combobox<Org>
        value={null}
        onChange={() => {}}
        options={options}
        ariaLabel="Организация"
        searchPlaceholder="Поиск организации"
      />,
    )
    await user.click(screen.getByLabelText('Организация'))
    const input = await screen.findByPlaceholderText('Поиск организации')
    await user.type(input, 'almaty')
    expect(screen.queryByText('Telse')).not.toBeInTheDocument()
    expect(screen.getByText('Almaty Crane')).toBeInTheDocument()
  })

  it('calls onSearchChange in async mode without local filtering', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    render(
      <Combobox<Org>
        value={null}
        onChange={() => {}}
        options={options}
        ariaLabel="Организация"
        onSearchChange={onSearch}
      />,
    )
    await user.click(screen.getByLabelText('Организация'))
    const input = await screen.findByPlaceholderText('Поиск…')
    await user.type(input, 'q')
    expect(onSearch).toHaveBeenCalled()
  })
})
