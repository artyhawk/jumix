import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDensity } from './use-density'

describe('useDensity', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('default density when storage empty', () => {
    const { result } = renderHook(() => useDensity())
    expect(result.current.density).toBe('default')
  })

  it('reads persisted compact from localStorage', () => {
    window.localStorage.setItem('jumix:density', 'compact')
    const { result } = renderHook(() => useDensity())
    expect(result.current.density).toBe('compact')
  })

  it('setDensity persists to localStorage', () => {
    const { result } = renderHook(() => useDensity())
    act(() => result.current.setDensity('compact'))
    expect(window.localStorage.getItem('jumix:density')).toBe('compact')
    expect(result.current.density).toBe('compact')
  })

  it('toggle flips default ↔ compact', () => {
    const { result } = renderHook(() => useDensity())
    expect(result.current.density).toBe('default')
    act(() => result.current.toggle())
    expect(result.current.density).toBe('compact')
    act(() => result.current.toggle())
    expect(result.current.density).toBe('default')
  })

  it('multiple hook instances stay in sync via subscribe', () => {
    const first = renderHook(() => useDensity())
    const second = renderHook(() => useDensity())
    act(() => first.result.current.setDensity('compact'))
    expect(first.result.current.density).toBe('compact')
    expect(second.result.current.density).toBe('compact')
  })
})
