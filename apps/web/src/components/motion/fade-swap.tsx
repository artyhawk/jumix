'use client'

import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Cross-fade между разными child'ами (по ключу). Используется для conditional
 * rendering где нужен плавный переход (например, password-toggle на login).
 */
export function FadeSwap({
  swapKey,
  children,
  className,
}: {
  swapKey: string | number
  children: ReactNode
  className?: string
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={swapKey}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18 }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
