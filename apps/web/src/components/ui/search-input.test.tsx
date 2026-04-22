import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchInput } from './search-input'

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders with placeholder', () => {
    render(<SearchInput value="" onDebouncedChange={() => {}} placeholder="Найти" />)
    expect(screen.getByPlaceholderText('Найти')).toBeInTheDocument()
  })

  it('debounces onChange to onDebouncedChange after 300ms', () => {
    const handler = vi.fn()
    render(<SearchInput value="" onDebouncedChange={handler} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'abc' } })
    expect(handler).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(handler).toHaveBeenCalledWith('abc')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('single debounced call after rapid typing', () => {
    const handler = vi.fn()
    render(<SearchInput value="" onDebouncedChange={handler} debounceMs={100} />)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'h' } })
    fireEvent.change(input, { target: { value: 'he' } })
    fireEvent.change(input, { target: { value: 'hel' } })
    fireEvent.change(input, { target: { value: 'hell' } })
    fireEvent.change(input, { target: { value: 'hello' } })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenLastCalledWith('hello')
  })

  it('clear button appears when value non-empty and resets value', () => {
    const handler = vi.fn()
    render(<SearchInput value="" onDebouncedChange={handler} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'x' } })
    const clearBtn = screen.getByRole('button', { name: 'Очистить поиск' })
    expect(clearBtn).toBeInTheDocument()
    fireEvent.click(clearBtn)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('')
    expect(handler).toHaveBeenCalledWith('')
  })

  it('clear button hidden when value empty', () => {
    render(<SearchInput value="" onDebouncedChange={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Очистить поиск' })).not.toBeInTheDocument()
  })

  it('respects custom debounceMs', () => {
    const handler = vi.fn()
    render(<SearchInput value="" onDebouncedChange={handler} debounceMs={500} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'q' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(handler).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(handler).toHaveBeenCalled()
  })
})
