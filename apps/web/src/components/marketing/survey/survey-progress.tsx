'use client'

import { motion } from 'framer-motion'

/**
 * Survey progress bar (B3-SURVEY). Shows current step + total + group section.
 * Animated width via framer-motion (smooth interpolation between steps).
 */
export function SurveyProgress({
  currentStep,
  totalSteps,
  groupTitle,
  groupIndex,
  groupTotal,
}: {
  currentStep: number
  totalSteps: number
  groupTitle?: string
  groupIndex?: number
  groupTotal?: number
}) {
  const pct = Math.min(100, Math.max(0, (currentStep / totalSteps) * 100))

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        {groupTitle && groupIndex !== undefined && groupTotal !== undefined ? (
          <span className="text-[var(--m-fg-tertiary)] tracking-wide truncate">
            Раздел {groupIndex} из {groupTotal}: {groupTitle}
          </span>
        ) : (
          <span className="text-[var(--m-fg-tertiary)] tracking-wide">Опрос</span>
        )}
        <span className="text-[var(--m-fg-secondary)] font-medium tabular-nums shrink-0">
          {currentStep} из {totalSteps}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-[var(--m-border)] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-[var(--m-brand)]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}
