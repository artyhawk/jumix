import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsMd, useMediaQuery } from './use-media-query'

interface FakeMql {
  matches: boolean
  media: string
  addEventListener: (e: string, h: (ev: { matches: boolean }) => void) => void
  removeEventListener: (e: string, h: (ev: { matches: boolean }) => void) => void
}

function installMatchMedia(matches: boolean): FakeMql {
  const listeners: Array<(ev: { matches: boolean }) => void> = []
  const mql: FakeMql = {
    matches,
    media: '',
    addEventListener: (_e, h) => {
      listeners.push(h)
    },
    removeEventListener: (_e, h) => {
      const i = listeners.indexOf(h)
      if (i >= 0) listeners.splice(i, 1)
    },
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => {
      mql.media = q
      return mql
    }),
  )
  // window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => {
      mql.media = q
      return mql
    },
  })
  return mql
}

beforeEach(() => {
  // ничего
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMediaQuery', () => {
  it('returns false on initial SSR-like render', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)
  })

  it('returns true when matchMedia matches', () => {
    installMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(true)
  })

  it('useIsMd uses 768px breakpoint', () => {
    installMatchMedia(true)
    const { result } = renderHook(() => useIsMd())
    expect(result.current).toBe(true)
  })

  it('returns false when matchMedia does not match', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useIsMd())
    expect(result.current).toBe(false)
  })
})
