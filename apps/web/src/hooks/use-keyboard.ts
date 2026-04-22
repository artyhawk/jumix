'use client'

import { useEffect } from 'react'

/**
 * Keyboard shortcut listener. Передавать точное сочетание в формате "cmd+k", "esc", "[".
 * Передаваемое событие — `keydown`. На macOS `cmd` → metaKey, на других — ctrlKey.
 */
export function useKeyboard(combo: string, handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    const parts = combo.toLowerCase().split('+')
    const key = parts[parts.length - 1] ?? ''
    const wantsMod = parts.includes('cmd') || parts.includes('ctrl')
    const wantsShift = parts.includes('shift')
    const wantsAlt = parts.includes('alt')

    const listener = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (wantsMod !== mod) return
      if (wantsShift !== e.shiftKey) return
      if (wantsAlt !== e.altKey) return
      if (e.key.toLowerCase() !== key) return
      handler(e)
    }

    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [combo, handler])
}
