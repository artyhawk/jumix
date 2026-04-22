'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Обёртка над списками: children при первом mount'е staggerят вход.
 * Если list re-rendered (фильтр, сортировка) — не re-animate (once=true).
 */
export function StaggerList({
  children,
  stagger = 0.04,
  once = true,
  className,
}: {
  children: ReactNode
  stagger?: number
  once?: boolean
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger } },
      }}
      viewport={{ once }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 6 },
        show: {
          opacity: 1,
          y: 0,
          transition: { type: 'spring', stiffness: 340, damping: 30 },
        },
      }}
    >
      {children}
    </motion.div>
  )
}
