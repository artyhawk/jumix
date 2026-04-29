'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const

/**
 * Wrapper для grid/flex с stagger-эффектом. Сам не анимируется — каждый
 * `StaggerItem` слушает свой viewport независимо и применяет delay = index * stagger.
 *
 * Why: variant-inheritance через `whileInView` на parent + child variants пробрасывался
 * нестабильно (оставлял card'ы opacity:0 в production). Direct prop-pattern совпадает
 * с AnimatedSection и работает надёжно.
 */
export function StaggeredChildren({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={className}>{children}</div>
}

export function StaggerItem({
  children,
  className,
  index = 0,
  stagger = 0.08,
}: {
  children: ReactNode
  className?: string
  index?: number
  stagger?: number
}) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, ease: PREMIUM_EASE, delay: index * stagger }}
    >
      {children}
    </motion.div>
  )
}
