'use client'

import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect } from 'react'

/**
 * Плавный interpolate между old и new value. Monospace + tnum — чтобы ширина
 * не скакала во время анимации.
 */
export function NumberCounter({
  value,
  format = (v) => Math.round(v).toLocaleString('ru-RU'),
  duration = 0.6,
  className,
}: {
  value: number
  format?: (v: number) => string
  duration?: number
  className?: string
}) {
  const mv = useMotionValue(0)
  const display = useTransform(mv, format)

  useEffect(() => {
    const controls = animate(mv, value, { duration, ease: 'easeOut' })
    return () => controls.stop()
  }, [mv, value, duration])

  return <motion.span className={`font-mono-numbers ${className ?? ''}`}>{display}</motion.span>
}
