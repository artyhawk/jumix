'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const

/**
 * Sequential reveal of children с stagger. Каждый child fade-up с задержкой 80ms.
 * Использует grid/flex parent — gap управляется родителем.
 */
export function StaggeredChildren({
  children,
  className,
  stagger = 0.08,
  amount = 0.2,
}: {
  children: ReactNode
  className?: string
  stagger?: number
  amount?: number
}) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
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
        hidden: { opacity: 0, y: 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.6, ease: PREMIUM_EASE },
        },
      }}
    >
      {children}
    </motion.div>
  )
}
