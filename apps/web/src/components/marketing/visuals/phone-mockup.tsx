'use client'

import { useT } from '@/lib/marketing-locale'
import { cn } from '@/lib/utils'
import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

const START_SECONDS = 6 * 3600 + 42 * 60 + 11

function format(total: number): string {
  const h = Math.floor(total / 3600)
    .toString()
    .padStart(2, '0')
  const m = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const s = Math.floor(total % 60)
    .toString()
    .padStart(2, '0')
  return `${h}:${m}:${s}`
}

/**
 * iPhone-стилизованная mockup мобильного приложения. SVG frame + content
 * (active shift screen). Timer тикает 1 раз в секунду (decorative — это
 * статичный demo, не реальная смена). respects prefers-reduced-motion.
 */
export function PhoneMockup({ className }: { className?: string }) {
  const t = useT()
  const reduceMotion = useReducedMotion()
  const [seconds, setSeconds] = useState(START_SECONDS)

  useEffect(() => {
    if (reduceMotion) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [reduceMotion])

  return (
    <div
      className={cn('relative isolate', className)}
      role="img"
      aria-label={t('marketing.phoneMockup.ariaLabel')}
    >
      {/* Glow */}
      <div
        className="absolute -inset-12 -z-10 rounded-[60px] opacity-50 blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(249,123,16,0.18) 0%, transparent 70%)',
        }}
        aria-hidden
      />

      <div
        className="relative mx-auto w-[260px] md:w-[280px] aspect-[9/19.5] rounded-[44px] border-[10px] border-[#0a0a0b] bg-[var(--m-surface)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden"
        style={{
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[100px] h-[26px] bg-[#0a0a0b] rounded-b-[16px] z-10" />

        {/* Status bar */}
        <div className="relative flex items-center justify-between px-6 pt-3 pb-1 text-[10px] text-[var(--m-fg)]">
          <span className="font-semibold">9:41</span>
          <div className="flex items-center gap-1">
            <span className="size-1 rounded-full bg-[var(--m-fg)]" />
            <span className="size-1 rounded-full bg-[var(--m-fg)]" />
            <span className="size-1 rounded-full bg-[var(--m-fg)]" />
            <span className="size-1 rounded-full bg-[var(--m-fg-tertiary)]" />
            <span className="ml-1 inline-block w-5 h-2 rounded-[2px] border border-[var(--m-fg)]/60 relative">
              <span className="absolute inset-[1px] right-[6px] bg-[var(--m-fg)] rounded-[1px]" />
            </span>
          </div>
        </div>

        {/* App header */}
        <div className="px-5 pt-6">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--m-success)]">
            <span className="size-1.5 rounded-full bg-[var(--m-success)] m-pulse-dot" />
            {t('marketing.phoneMockup.activeShift')}
          </span>
          <div className="mt-1 text-[14px] font-semibold text-[var(--m-fg)]">
            {t('marketing.phoneMockup.craneTitle')}
          </div>
          <div className="text-[11px] text-[var(--m-fg-secondary)]">
            {t('marketing.phoneMockup.site')}
          </div>
        </div>

        {/* Timer */}
        <div className="mt-7 mx-5 rounded-[20px] bg-gradient-to-b from-[var(--m-surface-elevated)] to-[var(--m-bg)] border border-[var(--m-border)] p-5 text-center">
          <div className="text-[10px] uppercase tracking-wider text-[var(--m-fg-tertiary)]">
            {t('marketing.phoneMockup.timerLabel')}
          </div>
          <motion.div
            key={Math.floor(seconds / 60)}
            initial={reduceMotion ? false : { opacity: 0.7 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="mt-2 text-[36px] font-semibold tabular-nums tracking-tight leading-none text-[var(--m-fg)]"
          >
            {format(seconds)}
          </motion.div>
          <div className="mt-3 text-[10px] text-[var(--m-success)] inline-flex items-center gap-1">
            <svg
              viewBox="0 0 12 12"
              className="size-3"
              fill="currentColor"
              role="img"
              aria-label={t('marketing.phoneMockup.geofenceConfirmed')}
            >
              <title>{t('marketing.phoneMockup.geofenceConfirmed')}</title>
              <path d="M5 8.6L2.4 6l-.8.8L5 10.2 11.4 3.8l-.8-.8z" />
            </svg>
            {t('marketing.phoneMockup.geofenceStatus')}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 mx-5 grid grid-cols-2 gap-2">
          <div className="rounded-[12px] bg-[var(--m-surface-elevated)] border border-[var(--m-border)] p-3">
            <div className="text-[10px] text-[var(--m-fg-tertiary)] uppercase tracking-wider">
              {t('marketing.phoneMockup.stats.today')}
            </div>
            <div className="mt-1 text-[16px] font-semibold text-[var(--m-fg)] tabular-nums">
              ₸ 18 400
            </div>
          </div>
          <div className="rounded-[12px] bg-[var(--m-surface-elevated)] border border-[var(--m-border)] p-3">
            <div className="text-[10px] text-[var(--m-fg-tertiary)] uppercase tracking-wider">
              {t('marketing.phoneMockup.stats.month')}
            </div>
            <div className="mt-1 text-[16px] font-semibold text-[var(--m-fg)] tabular-nums">
              ₸ 412 000
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="absolute left-5 right-5 bottom-7 flex flex-col gap-2">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="h-10 rounded-[12px] bg-[var(--m-brand)] text-[#0a0a0b] text-[13px] font-semibold pointer-events-none"
          >
            {t('marketing.phoneMockup.actions.endShift')}
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="h-10 rounded-[12px] border border-[var(--m-border-strong)] text-[var(--m-fg)] text-[13px] font-medium pointer-events-none"
          >
            {t('marketing.phoneMockup.actions.break')}
          </button>
        </div>
      </div>
    </div>
  )
}
