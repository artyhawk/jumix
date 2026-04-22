'use client'

import { useIsMd } from '@/hooks/use-media-query'
import { Toaster } from 'sonner'

/**
 * Sonner с нашей палитрой и позицией, зависящей от breakpoint'а:
 *   - desktop → bottom-right
 *   - mobile → top-center (свободнее чем bottom где keyboard)
 */
export function ToastProvider() {
  const isMd = useIsMd()
  return (
    <Toaster
      position={isMd ? 'bottom-right' : 'top-center'}
      theme="dark"
      richColors={false}
      closeButton
      toastOptions={{
        style: {
          background: 'var(--color-layer-3)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-md)',
        },
      }}
    />
  )
}
