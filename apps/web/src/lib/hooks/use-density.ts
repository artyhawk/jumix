'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * Global user preference для плотности таблиц (B3-UI-5a). Persist'ится в
 * localStorage, shared across all DataTable instances через
 * `useSyncExternalStore` — изменение в одном tab применяется немедленно
 * без props prop-drilling.
 *
 * SSR safe: server всегда возвращает 'default' (sensible initial); на
 * client после hydration hook считывает реальное значение.
 */
export type Density = 'default' | 'compact'

const STORAGE_KEY = 'jumix:density'

function readStored(): Density {
  if (typeof window === 'undefined') return 'default'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === 'compact' ? 'compact' : 'default'
  } catch {
    return 'default'
  }
}

const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): Density {
  return readStored()
}

function getServerSnapshot(): Density {
  return 'default'
}

/**
 * Устанавливает density + broadcasts к подписанным компонентам.
 */
function writeStored(next: Density): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // ignore quota errors — preference loss acceptable
  }
  for (const cb of listeners) cb()
}

export function useDensity(): {
  density: Density
  setDensity: (next: Density) => void
  toggle: () => void
} {
  const density = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // cross-tab: listen storage event → re-broadcast
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        for (const cb of listeners) cb()
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const setDensity = (next: Density) => writeStored(next)
  const toggle = () => writeStored(density === 'compact' ? 'default' : 'compact')
  return { density, setDensity, toggle }
}
