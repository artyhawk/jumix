'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const

/**
 * Wrapper для scroll-triggered fade-up. Использует viewport.once = true чтобы
 * не ре-триггерить при возврате scroll. respects prefers-reduced-motion.
 */
export function AnimatedSection({
  children,
  delay = 0,
  className,
  amount = 0.2,
}: {
  children: ReactNode
  delay?: number
  className?: string
  amount?: number
}) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.7, ease: PREMIUM_EASE, delay }}
    >
      {children}
    </motion.div>
  )
}
