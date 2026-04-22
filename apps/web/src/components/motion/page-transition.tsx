'use client'

import { motion } from 'framer-motion'
import { Children, type ReactNode } from 'react'

/**
 * Анимация входа страницы: staggered fade + 8px Y slide.
 * Spring physics (не ease) — плавнее и естественнее ощущается.
 *
 * Children с data-attribute или просто как top-level nodes.
 */
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const item = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 28 },
  },
}

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={container} initial="hidden" animate="show">
      {Children.map(children, (child) => (
        <motion.div variants={item}>{child}</motion.div>
      ))}
    </motion.div>
  )
}
