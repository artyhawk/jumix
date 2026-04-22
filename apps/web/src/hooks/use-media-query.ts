'use client'

import { useEffect, useState } from 'react'

/**
 * Реактивный matchMedia. Возвращает текущее значение и подписывается на изменения.
 *
 * На сервере (SSR) и до hydration возвращает `false` — first paint идёт в mobile-first
 * базовом стиле. После hydration значение обновляется под реальный размер экрана.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return matches
}

/** Tailwind-совместимые breakpoints (≥ bound'ы). */
export const useIsMd = () => useMediaQuery('(min-width: 768px)')
export const useIsLg = () => useMediaQuery('(min-width: 1024px)')
